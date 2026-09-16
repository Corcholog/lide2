import type { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from './helpers/db'
import { playMatch } from './helpers/matches'

/**
 * Walkovers: a team that does not turn up within the rules' 15 minutes loses the
 * matchup.
 *
 * Nothing is played, so there is no .rofl and no `matches` row; the result lives
 * on the fixture and the standings add both kinds of result. A walkover counts
 * as a played matchup, a win and a loss, with no kills.
 */

interface FixtureRow {
  status: string
  team_a_win: boolean | null
  team_b_win: boolean | null
  team_a_kills: number | null
  winner_team_id: string | null
  walkover_team_id: string | null
}

interface StandingRow {
  team_name: string
  games: number
  wins: number
  losses: number
  kills: number
  kill_diff: number
  avg_minutes: number | null
  last_played_at: string | null
  form: boolean[] | null
  position: number
}

interface WalkoverResult {
  ok: boolean
  error?: string
  winner?: string
  absent?: string
  cleared?: boolean
}

describe('a matchup nobody turned up for', () => {
  let db: PGlite
  let tournamentId: string
  const team = new Map<string, string>()
  const matchupIds = new Map<string, string>()

  beforeEach(async () => {
    db = await createTestDb()

    const tournament = await db.query<{ id: string }>(
      `insert into public.tournaments (name, slug, format)
       values ('LIDE 2', 'lide-2', 'grupos') returning id`,
    )
    tournamentId = tournament.rows[0].id

    for (const name of ['Equipo 01', 'Equipo 07', 'Equipo 10', 'Equipo 15']) {
      const { rows } = await db.query<{ id: string }>(
        `insert into public.teams (tournament_id, name, group_label)
         values ($1, $2, 'Grupo A') returning id`,
        [tournamentId, name],
      )
      team.set(name, rows[0].id)
    }

    // Two matchups on matchday 1 and one on matchday 2: some to play, some to award.
    const matchups: [number, string, string, string][] = [
      [1, 'Equipo 01', 'Equipo 07', '2026-09-05T17:00:00Z'],
      [1, 'Equipo 10', 'Equipo 15', '2026-09-05T17:00:00Z'],
      [2, 'Equipo 01', 'Equipo 10', '2026-09-12T17:00:00Z'],
    ]
    for (const [matchday, a, b, kickoff] of matchups) {
      const { rows } = await db.query<{ id: string }>(
        `insert into public.fixtures
           (tournament_id, group_label, matchday, slot, kickoff, team_a_id, team_b_id)
         values ($1, 'Grupo A', $2, 1, $3, $4, $5) returning id`,
        [tournamentId, matchday, kickoff, team.get(a), team.get(b)],
      )
      matchupIds.set(`${a} vs ${b}`, rows[0].id)
    }
  }, 60_000)

  afterEach(async () => {
    team.clear()
    matchupIds.clear()
    await db?.close()
  })

  async function award(matchup: string, winner: string | null): Promise<WalkoverResult> {
    const { rows } = await db.query<{ set_fixture_walkover: WalkoverResult }>(
      'select public.set_fixture_walkover($1, $2)',
      [matchupIds.get(matchup), winner ? team.get(winner) : null],
    )
    return rows[0].set_fixture_walkover
  }

  /** Plays a matchup and links it to its fixture. */
  async function play(matchup: string, blue: string, red: string, kills: [number, number]) {
    const matchId = await playMatch(db, {
      blueTeamId: team.get(blue),
      redTeamId: team.get(red),
      winner: kills[0] > kills[1] ? 'blue' : 'red',
      blueKills: kills[0],
      redKills: kills[1],
      minutes: 30,
      tournamentId,
    })
    await db.query(`update public.fixtures set match_id = $1 where id = $2`, [
      matchId,
      matchupIds.get(matchup),
    ])
    return matchId
  }

  async function fixture(matchup: string): Promise<FixtureRow> {
    const { rows } = await db.query<FixtureRow>(
      `select status, team_a_win, team_b_win, team_a_kills, winner_team_id, walkover_team_id
         from public.fixture_results where id = $1`,
      [matchupIds.get(matchup)],
    )
    return rows[0]
  }

  async function standings(): Promise<StandingRow[]> {
    const { rows } = await db.query<StandingRow>(
      `select team_name, games, wins, losses, kills, kill_diff, avg_minutes,
              last_played_at, form, position
         from public.group_standings
        where tournament_id = $1 order by position, team_name`,
      [tournamentId],
    )
    return rows.map((r) => ({
      ...r,
      games: Number(r.games),
      wins: Number(r.wins),
      losses: Number(r.losses),
      kills: Number(r.kills),
      kill_diff: Number(r.kill_diff),
    }))
  }

  it('the matchup says who took it and that it was not played', async () => {
    const result = await award('Equipo 01 vs Equipo 07', 'Equipo 01')

    expect(result).toMatchObject({ ok: true, winner: 'Equipo 01', absent: 'Equipo 07' })

    expect(await fixture('Equipo 01 vs Equipo 07')).toMatchObject({
      status: 'w.o.',
      // The fixture uses these to style the names (winner bold, absent team red);
      // without them both would look like an unplayed matchup.
      team_a_win: true,
      team_b_win: false,
      winner_team_id: team.get('Equipo 01'),
      walkover_team_id: team.get('Equipo 01'),
      // No score: nothing was played.
      team_a_kills: null,
    })
  })

  it('counts as a played matchup, a win and a loss', async () => {
    await award('Equipo 01 vs Equipo 07', 'Equipo 01')

    const rows = await standings()
    const one = rows.find((r) => r.team_name === 'Equipo 01')!
    const seven = rows.find((r) => r.team_name === 'Equipo 07')!

    expect(one).toMatchObject({ games: 1, wins: 1, losses: 0 })
    expect(seven).toMatchObject({ games: 1, wins: 0, losses: 1 })

    // Within a group, wins must add up to losses; awarding a win without the
    // absent team's loss would break that.
    expect(rows.reduce((n, r) => n + r.wins, 0)).toBe(rows.reduce((n, r) => n + r.losses, 0))
  })

  it('brings no kills, so it leaves the kill difference where it was', async () => {
    // Both win one: Team 10 by playing, 20 to 5; Team 01 by walkover.
    await play('Equipo 10 vs Equipo 15', 'Equipo 10', 'Equipo 15', [20, 5])
    await award('Equipo 01 vs Equipo 07', 'Equipo 01')

    const rows = await standings()
    const one = rows.find((r) => r.team_name === 'Equipo 01')!
    const ten = rows.find((r) => r.team_name === 'Equipo 10')!

    // The walkover win adds nothing to either kill column.
    expect(one).toMatchObject({ wins: 1, kills: 0, kill_diff: 0 })
    expect(ten).toMatchObject({ wins: 1, kills: 20, kill_diff: 15 })

    // These two teams have not played each other, so their relative order is
    // not asserted. How a walkover affects the head-to-head tiebreak is covered
    // in tests/group-tiebreak.test.ts.
  })

  it('stays out of the average duration instead of dragging it to zero', async () => {
    await play('Equipo 01 vs Equipo 07', 'Equipo 01', 'Equipo 07', [15, 9])
    await award('Equipo 01 vs Equipo 10', 'Equipo 01')

    const one = (await standings()).find((r) => r.team_name === 'Equipo 01')!

    expect(one).toMatchObject({ games: 2, wins: 2 })
    // The one match lasted 30 minutes; counting the walkover as 0 would halve
    // the average.
    expect(Number(one.avg_minutes)).toBe(30)
  })

  it('lands in the matchday it should have been played, not when it was entered', async () => {
    // Matchday 1 played and lost, matchday 2 awarded. Form lists the most recent
    // first, so the walkover comes first.
    await play('Equipo 01 vs Equipo 07', 'Equipo 07', 'Equipo 01', [18, 4])
    await award('Equipo 01 vs Equipo 10', 'Equipo 01')

    const one = (await standings()).find((r) => r.team_name === 'Equipo 01')!

    expect(one.form).toEqual([true, false])
    expect(one.last_played_at).toEqual(new Date('2026-09-12T17:00:00Z'))
  })

  it('can be undone, and the matchup goes back to pending', async () => {
    await award('Equipo 01 vs Equipo 07', 'Equipo 01')
    expect((await fixture('Equipo 01 vs Equipo 07')).status).toBe('w.o.')

    const result = await award('Equipo 01 vs Equipo 07', null)
    expect(result).toMatchObject({ ok: true, cleared: true })

    expect(await fixture('Equipo 01 vs Equipo 07')).toMatchObject({
      status: 'pendiente',
      winner_team_id: null,
      walkover_team_id: null,
      team_a_win: null,
    })
    // Clearing it removes it for both teams.
    expect((await standings()).every((r) => r.games === 0)).toBe(true)
  })

  it('refuses a team that does not play that matchup', async () => {
    const result = await award('Equipo 01 vs Equipo 07', 'Equipo 15')

    expect(result.ok).toBe(false)
    expect(result.error).toBe('Ese equipo no juega este cruce.')
  })

  it('refuses when the matchup already has a match', async () => {
    await play('Equipo 01 vs Equipo 07', 'Equipo 01', 'Equipo 07', [15, 9])

    const result = await award('Equipo 01 vs Equipo 07', 'Equipo 01')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('ya tiene una partida cargada')
  })

  it('refuses to hook a replay to a matchup that was awarded', async () => {
    await award('Equipo 01 vs Equipo 07', 'Equipo 01')

    const matchId = await playMatch(db, {
      blueTeamId: team.get('Equipo 01'),
      redTeamId: team.get('Equipo 07'),
      winner: 'blue',
      tournamentId,
    })

    const { rows } = await db.query<{ assign_match_to_fixture: { ok: boolean; error?: string } }>(
      'select public.assign_match_to_fixture($1, $2, $3)',
      [matchId, matchupIds.get('Equipo 01 vs Equipo 07'), team.get('Equipo 01')],
    )

    expect(rows[0].assign_match_to_fixture.ok).toBe(false)
    expect(rows[0].assign_match_to_fixture.error).toContain('cargado como no presentado')
  })

  it('the database itself rejects the two states that make no sense', async () => {
    const id = matchupIds.get('Equipo 01 vs Equipo 07')

    // A winner from another matchup would give a point to a team that was not
    // there.
    await expect(
      db.query(`update public.fixtures set walkover_team_id = $1 where id = $2`, [
        team.get('Equipo 15'),
        id,
      ]),
    ).rejects.toThrow(/fixtures_walkover_is_a_team/)

    // Played and awarded at once: contradictory, and the standings would count
    // both.
    const matchId = await playMatch(db, {
      blueTeamId: team.get('Equipo 01'),
      redTeamId: team.get('Equipo 07'),
      winner: 'blue',
      tournamentId,
    })
    await db.query(`update public.fixtures set match_id = $1 where id = $2`, [matchId, id])

    await expect(
      db.query(`update public.fixtures set walkover_team_id = $1 where id = $2`, [
        team.get('Equipo 01'),
        id,
      ]),
    ).rejects.toThrow(/fixtures_walkover_or_match/)
  })

  it('does not invent a match: the played ones are still only the replays', async () => {
    await award('Equipo 01 vs Equipo 07', 'Equipo 01')

    const { rows } = await db.query<{ n: number }>(
      'select count(*)::int as n from public.matches',
    )
    expect(rows[0].n).toBe(0)

    // Nothing derived from scoreboards sees it either.
    const summaries = await db.query<{ n: number }>(
      'select count(*)::int as n from public.match_summaries',
    )
    expect(summaries.rows[0].n).toBe(0)
  })
})
