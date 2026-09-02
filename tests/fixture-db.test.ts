import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb } from './helpers/db'
import { playMatch } from './helpers/matches'

interface FixtureRow {
  group_label: string
  matchday: number
  slot: number
  team_a_name: string
  team_b_name: string
  team_a_kills: number | null
  team_b_kills: number | null
  team_a_win: boolean | null
  status: string
  winner_team_id: string | null
}

interface ByeRow {
  matchday: number
  slot: number
  group_label: string
  team_name: string
}

/**
 * A group of 5 with the same skeleton as the real one: in every slot two pairs
 * play and one rests. One group is enough to verify the views; that the whole
 * fixture adds up is checked by tests/fixture.test.ts over the data, with no
 * database.
 */
describe('fixture in the database', () => {
  let db: PGlite
  let tournamentId: string
  const team = new Map<string, string>()

  beforeAll(async () => {
    db = await createTestDb()

    const tournament = await db.query<{ id: string }>(
      `insert into public.tournaments (name, slug, format)
       values ('LIDE 2', 'lide-2', 'grupos') returning id`,
    )
    tournamentId = tournament.rows[0].id

    const universities = new Map<string, string>()
    for (const [tag, name] of [
      ['UNLP', 'Universidad Nacional de La Plata'],
      ['UNER', 'Universidad Nacional de Entre Ríos'],
      ['UADE', 'Universidad Argentina de la Empresa'],
    ]) {
      const { rows } = await db.query<{ id: string }>(
        `insert into public.universities (name, tag) values ($1, $2) returning id`,
        [name, tag],
      )
      universities.set(tag, rows[0].id)
    }

    for (const name of ['Equipo 01', 'Equipo 07', 'Equipo 10', 'Equipo 15', 'Equipo 16']) {
      const { rows } = await db.query<{ id: string }>(
        `insert into public.teams (tournament_id, name, group_label, university_id)
         values ($1, $2, 'Grupo A', $3) returning id`,
        [tournamentId, name, universities.get('UNLP')],
      )
      team.set(name, rows[0].id)
    }

    // Team 15 is one of those that came out of individual signups: three
    // universities, the main one first.
    for (const [index, tag] of ['UNER', 'UADE', 'UNLP'].entries()) {
      await db.query(
        `insert into public.team_universities (team_id, university_id, order_index)
         values ($1, $2, $3)`,
        [team.get('Equipo 15'), universities.get(tag), index],
      )
    }
    await db.query(`update public.teams set university_id = $1 where id = $2`, [
      universities.get('UNER'),
      team.get('Equipo 15'),
    ])

    // Team 01 represents just one.
    await db.query(
      `insert into public.team_universities (team_id, university_id, order_index)
       values ($1, $2, 0)`,
      [team.get('Equipo 01'), universities.get('UNLP')],
    )

    const matchups: [number, number, string, string][] = [
      [1, 1, 'Equipo 10', 'Equipo 07'],
      [1, 1, 'Equipo 15', 'Equipo 16'],
      [1, 2, 'Equipo 07', 'Equipo 15'],
      [1, 2, 'Equipo 01', 'Equipo 10'],
    ]

    for (const [matchday, slot, a, b] of matchups) {
      await db.query(
        `insert into public.fixtures
           (tournament_id, group_label, matchday, slot, kickoff, team_a_id, team_b_id)
         values ($1, 'Grupo A', $2, $3, $4, $5, $6)`,
        [
          tournamentId,
          matchday,
          slot,
          slot === 1 ? '2026-09-05T17:00:00Z' : '2026-09-05T18:00:00Z',
          team.get(a),
          team.get(b),
        ],
      )
    }
  }, 60_000)

  afterAll(async () => {
    await db.close()
  })

  it('shows the matchups as pending while there is no match', async () => {
    // Within a slot there are two matchups per group and the order between
    // them means nothing, so they are tiebroken by name so the test does not
    // depend on the order Postgres returns them in.
    const { rows } = await db.query<FixtureRow>(
      `select * from public.fixture_results
        where tournament_id = $1
        order by matchday, slot, team_a_name`,
      [tournamentId],
    )

    expect(rows).toHaveLength(4)
    expect(rows.every((row) => row.status === 'pendiente')).toBe(true)
    expect(rows.every((row) => row.winner_team_id === null)).toBe(true)
    expect(rows.map((row) => `${row.team_a_name} vs ${row.team_b_name}`)).toEqual([
      'Equipo 10 vs Equipo 07',
      'Equipo 15 vs Equipo 16',
      'Equipo 01 vs Equipo 10',
      'Equipo 07 vs Equipo 15',
    ])
  })

  it('leaves one of the five on a bye in every slot', async () => {
    const { rows } = await db.query<ByeRow>(
      `select * from public.fixture_byes where tournament_id = $1 order by matchday, slot`,
      [tournamentId],
    )

    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ matchday: 1, slot: 1, team_name: 'Equipo 01' })
    expect(rows[1]).toMatchObject({ matchday: 1, slot: 2, team_name: 'Equipo 16' })
  })

  it('brings the result once the match is hooked to it', async () => {
    // Team 10 (blue side) beats 07 by 18 to 6.
    const matchId = await playMatch(db, {
      blueTeamId: team.get('Equipo 10'),
      redTeamId: team.get('Equipo 07'),
      winner: 'blue',
      blueKills: 18,
      redKills: 6,
      stageLabel: 'Grupo A',
      tournamentId,
    })

    await db.query(
      `update public.fixtures set match_id = $1
        where team_a_id = $2 and team_b_id = $3`,
      [matchId, team.get('Equipo 10'), team.get('Equipo 07')],
    )

    const { rows } = await db.query<FixtureRow>(
      `select * from public.fixture_results where match_id = $1`,
      [matchId],
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      status: 'jugado',
      team_a_kills: 18,
      team_b_kills: 6,
      team_a_win: true,
      winner_team_id: team.get('Equipo 10'),
    })
  })

  it('flips the result when team A played the red side', async () => {
    // The matchup says "15 vs 16" but in the match 15 played red and lost.
    const matchId = await playMatch(db, {
      blueTeamId: team.get('Equipo 16'),
      redTeamId: team.get('Equipo 15'),
      winner: 'blue',
      blueKills: 21,
      redKills: 11,
      stageLabel: 'Grupo A',
      tournamentId,
    })

    await db.query(
      `update public.fixtures set match_id = $1
        where team_a_id = $2 and team_b_id = $3`,
      [matchId, team.get('Equipo 15'), team.get('Equipo 16')],
    )

    const { rows } = await db.query<FixtureRow>(
      `select * from public.fixture_results where match_id = $1`,
      [matchId],
    )

    expect(rows[0]).toMatchObject({
      team_a_name: 'Equipo 15',
      team_a_kills: 11,
      team_a_win: false,
      team_b_kills: 21,
      team_b_win: true,
      winner_team_id: team.get('Equipo 16'),
    })
  })

  it("lists all of a team's universities in the group table", async () => {
    const { rows } = await db.query<{ team_name: string; university_tags: string[] }>(
      `select team_name, university_tags from public.group_standings
        where tournament_id = $1 order by team_name`,
      [tournamentId],
    )

    const tags = new Map(rows.map((row) => [row.team_name, row.university_tags]))

    // The main one first, then the others in the order the organizers set.
    expect(tags.get('Equipo 15')).toEqual(['UNER', 'UADE', 'UNLP'])
    expect(tags.get('Equipo 01')).toEqual(['UNLP'])
  })

  it('falls back to the loose university when the team has no list loaded', async () => {
    // Team 07 never made it into team_universities, but it has a university_id.
    const { rows } = await db.query<{ university_tags: string[] }>(
      `select university_tags from public.group_standings where team_id = $1`,
      [team.get('Equipo 07')],
    )

    expect(rows[0].university_tags).toEqual(['UNLP'])
  })

  it('does not let two matchups claim the same match', async () => {
    const { rows } = await db.query<{ match_id: string }>(
      `select match_id from public.fixtures where match_id is not null limit 1`,
    )

    await expect(
      db.query(
        `update public.fixtures set match_id = $1
          where team_a_id = $2 and team_b_id = $3`,
        [rows[0].match_id, team.get('Equipo 01'), team.get('Equipo 10')],
      ),
    ).rejects.toThrow(/fixtures_match_key/)
  })
})
