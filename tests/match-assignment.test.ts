import type { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from './helpers/db'
import { playScoreboard } from './helpers/matches'

/**
 * Hooking a match up with its fixture matchup.
 *
 * The case that matters is 5 September: no roster is loaded, so the database
 * cannot know who played. What gets verified is that assigning the matchup is
 * enough for everything else to fall into place on its own, and that the second
 * matchday no longer needs to be told the orientation.
 */

interface AssignResult {
  ok: boolean
  error?: string
  learned?: number
  conflicts?: string[]
  blue_team_id?: string
  red_team_id?: string
}

const A = ['a1', 'a2', 'a3', 'a4', 'a5']
const B = ['b1', 'b2', 'b3', 'b4', 'b5']

describe('assigning matches to the fixture', () => {
  let db: PGlite
  let tournamentId: string
  let team01: string
  let team15: string
  let matchupM1: string
  let matchupM2: string

  beforeEach(async () => {
    db = await createTestDb()

    const tournament = await db.query<{ id: string }>(
      `insert into public.tournaments (name, slug) values ('LIDE 2', 'lide-2') returning id`,
    )
    tournamentId = tournament.rows[0].id

    const teams = await db.query<{ id: string; name: string }>(
      `insert into public.teams (tournament_id, name, group_label)
       values ($1, 'Equipo 01', 'Grupo A'), ($1, 'Equipo 15', 'Grupo A')
       returning id, name`,
      [tournamentId],
    )
    team01 = teams.rows.find((row) => row.name === 'Equipo 01')!.id
    team15 = teams.rows.find((row) => row.name === 'Equipo 15')!.id

    const fixtures = await db.query<{ id: string; matchday: number }>(
      `insert into public.fixtures
         (tournament_id, group_label, matchday, slot, kickoff, team_a_id, team_b_id)
       values
         ($1, 'Grupo A', 1, 1, '2026-09-05T17:00:00Z', $2, $3),
         ($1, 'Grupo A', 2, 1, '2026-09-12T17:00:00Z', $3, $2)
       returning id, matchday`,
      [tournamentId, team01, team15],
    )
    matchupM1 = fixtures.rows.find((row) => row.matchday === 1)!.id
    matchupM2 = fixtures.rows.find((row) => row.matchday === 2)!.id
  }, 60_000)

  afterEach(async () => {
    await db?.close()
  })

  async function subir(options: {
    blue: string[]
    red: string[]
    winner?: 'blue' | 'red'
    playedAt?: string
  }): Promise<string> {
    return playScoreboard(db, {
      winner: options.winner ?? 'blue',
      playedAt: options.playedAt,
      blue: options.blue.map((puuid) => ({ puuid, kills: 3, deaths: 2, assists: 4 })),
      red: options.red.map((puuid) => ({ puuid, kills: 2, deaths: 3, assists: 3 })),
    })
  }

  async function assign(
    matchId: string,
    fixtureId: string,
    blueTeamId?: string | null,
  ): Promise<AssignResult> {
    const { rows } = await db.query<{ assign_match_to_fixture: AssignResult }>(
      'select public.assign_match_to_fixture($1, $2, $3)',
      [matchId, fixtureId, blueTeamId ?? null],
    )
    return rows[0].assign_match_to_fixture
  }

  it('a freshly uploaded match shows up in the queue with no teams', async () => {
    const matchId = await subir({ blue: A, red: B })

    const { rows } = await db.query<{
      match_id: string
      blue_guess: string | null
      blue_players: { name: string }[]
    }>('select match_id, blue_guess, blue_players from public.unassigned_matches')

    expect(rows).toHaveLength(1)
    expect(rows[0].match_id).toBe(matchId)
    // With no rosters loaded there is nothing to deduce: hence the panel asks.
    expect(rows[0].blue_guess).toBeNull()
    expect(rows[0].blue_players.map((p) => p.name)).toEqual(A)
  })

  it('assigning the matchup teaches the roster and completes the match', async () => {
    const matchId = await subir({ blue: A, red: B })
    const result = await assign(matchId, matchupM1, team01)

    expect(result.ok).toBe(true)
    expect(result.learned).toBe(10)
    expect(result.conflicts).toEqual([])

    const match = await db.query<{
      blue_team_id: string
      red_team_id: string
      tournament_id: string
      stage_label: string
      round_label: string
    }>(
      `select blue_team_id, red_team_id, tournament_id, stage_label, round_label
         from public.matches where id = $1`,
      [matchId],
    )
    expect(match.rows[0]).toMatchObject({
      blue_team_id: team01,
      red_team_id: team15,
      tournament_id: tournamentId,
      stage_label: 'Grupo A',
      round_label: 'Fecha 1',
    })

    const roster = await db.query<{ n: string }>(
      `select count(*) as n from public.team_members where team_id = $1 and left_at is null`,
      [team01],
    )
    expect(Number(roster.rows[0].n)).toBe(5)

    // And it leaves the queue.
    const cola = await db.query('select 1 from public.unassigned_matches')
    expect(cola.rows).toHaveLength(0)
  })

  it('the table and the stats find out on their own', async () => {
    const matchId = await subir({ blue: A, red: B })
    await assign(matchId, matchupM1, team01)

    const standings = await db.query<{ team_name: string; games: number; wins: number }>(
      `select team_name, games, wins from public.group_standings
        where tournament_id = $1 order by team_name`,
      [tournamentId],
    )
    expect(standings.rows.map((r) => [r.team_name, Number(r.games), Number(r.wins)])).toEqual([
      ['Equipo 01', 1, 1],
      ['Equipo 15', 1, 0],
    ])

    const context = await db.query<{ matchday: number; phase: string }>(
      'select matchday, phase from public.match_context where match_id = $1',
      [matchId],
    )
    expect(context.rows[0]).toMatchObject({ matchday: 1, phase: 'grupos' })

    const stats = await db.query<{ n: string }>(
      `select count(*) as n from public.player_phase_totals
        where tournament_id = $1 and not is_total and matchday = 1`,
      [tournamentId],
    )
    expect(Number(stats.rows[0].n)).toBe(10)
  })

  it('with the roster already learned, the second matchday needs no telling', async () => {
    await assign(await subir({ blue: A, red: B }), matchupM1, team01)

    // Matchday 2: the same teams, with their sides swapped.
    const segunda = await subir({ blue: B, red: A, playedAt: '2026-09-12T17:00:00Z' })

    const cola = await db.query<{ blue_guess: string; red_guess: string }>(
      'select blue_guess, red_guess from public.unassigned_matches',
    )
    expect(cola.rows[0]).toMatchObject({ blue_guess: team15, red_guess: team01 })

    // With no third argument: the orientation is deduced.
    const result = await assign(segunda, matchupM2)
    expect(result.ok).toBe(true)
    expect(result.blue_team_id).toBe(team15)
    expect(result.learned).toBe(0)
  })

  it('a matchup that team does not play cannot be assigned', async () => {
    const otro = await db.query<{ id: string }>(
      `insert into public.teams (tournament_id, name, group_label)
       values ($1, 'Equipo 07', 'Grupo A') returning id`,
      [tournamentId],
    )

    const result = await assign(await subir({ blue: A, red: B }), matchupM1, otro.rows[0].id)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/no juega/i)
  })

  it('with no roster and no orientation, it asks instead of inventing', async () => {
    const result = await assign(await subir({ blue: A, red: B }), matchupM1)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/azul/i)
  })

  it('reassigning to another matchup frees the previous one', async () => {
    const matchId = await subir({ blue: A, red: B })
    await assign(matchId, matchupM1, team01)
    await assign(matchId, matchupM2, team01)

    const { rows } = await db.query<{ matchday: number; match_id: string | null }>(
      'select matchday, match_id from public.fixtures order by matchday',
    )
    expect(rows.map((r) => r.match_id)).toEqual([null, matchId])
  })

  it('a player who already has a team is not moved on its own: it is reported', async () => {
    await assign(await subir({ blue: A, red: B }), matchupM1, team01)

    // a1, who belongs to team 01, shows up playing ON team 15's SIDE. Either
    // the match is misassigned or somebody is playing where they should not:
    // both are for a person to look at, not to be settled by silently moving
    // them between teams.
    const segunda = await subir({
      blue: ['a1', 'b2', 'b3', 'b4', 'b5'],
      red: ['c1', 'c2', 'c3', 'c4', 'c5'],
      playedAt: '2026-09-12T17:00:00Z',
    })
    const result = await assign(segunda, matchupM2, team15)

    expect(result.ok).toBe(true)
    expect(result.conflicts).toEqual(['a1'])
    // The other side's five are indeed new and get registered.
    expect(result.learned).toBe(5)

    const teams = await db.query<{ n: string }>(
      `select count(*) as n from public.team_members
        where player_id = (select id from public.players where puuid = 'a1') and left_at is null`,
    )
    expect(Number(teams.rows[0].n)).toBe(1)
  })

  it('unassigning frees the match but does not erase what was learned', async () => {
    const matchId = await subir({ blue: A, red: B })
    await assign(matchId, matchupM1, team01)

    await db.query('select public.unassign_match($1)', [matchId])

    const fixture = await db.query<{ match_id: string | null }>(
      'select match_id from public.fixtures where id = $1',
      [matchupM1],
    )
    expect(fixture.rows[0].match_id).toBeNull()

    const roster = await db.query<{ n: string }>(
      'select count(*) as n from public.team_members where left_at is null',
    )
    expect(Number(roster.rows[0].n)).toBe(10)

    // The teams are deduced again from what is already known, so the match
    // still knows who played even though it belongs to no matchup.
    const match = await db.query<{ blue_team_id: string | null; round_label: string | null }>(
      'select blue_team_id, round_label from public.matches where id = $1',
      [matchId],
    )
    expect(match.rows[0].blue_team_id).toBe(team01)
    expect(match.rows[0].round_label).toBeNull()
  })
})
