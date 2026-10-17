import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb } from './helpers/db'
import { playScoreboard } from './helpers/matches'
import { championOf, championTeamId, finalScore } from '@/lib/lide2/winner'
import type { SeriesResultRow } from '@/types/db'

/*
 * Results entered while a game is on, replays filed afterwards (0036).
 *
 * The organizers know who won as it happens but the replays come later, so the
 * bracket has to move on a typed result and then take the replay over without
 * counting the game twice.
 */

describe('results entered before the replay', () => {
  let db: PGlite
  let tournamentId: string
  let quarter: string
  let semi: string
  const team = new Map<string, string>()

  const five = (prefix: string) =>
    [1, 2, 3, 4, 5].map((n) => ({ puuid: `${prefix}-${n}`, position: 'MIDDLE' }))

  async function row(id: string): Promise<SeriesResultRow> {
    const { rows } = await db.query<SeriesResultRow>(
      'select * from public.series_results where id = $1',
      [id],
    )
    return rows[0]
  }

  async function enter(game: number, winner: string | null) {
    const { rows } = await db.query<{ result: { ok: boolean; error?: string } }>(
      'select public.set_game_result($1, $2::smallint, $3) as result',
      [quarter, game, winner ? team.get(winner) : null],
    )
    return rows[0].result
  }

  async function file(game: number, winner: string, loser: string) {
    const matchId = await playScoreboard(db, {
      tournamentId,
      blueTeamId: team.get(winner),
      redTeamId: team.get(loser),
      winner: 'blue',
      blue: five(winner),
      red: five(loser),
    })
    const { rows } = await db.query<{ result: { ok: boolean; contradicts_result?: boolean } }>(
      'select public.assign_match_to_series($1, $2, $3, $4::smallint) as result',
      [matchId, quarter, team.get(winner), game],
    )
    return rows[0].result
  }

  beforeAll(async () => {
    db = await createTestDb()

    tournamentId = (
      await db.query<{ id: string }>(
        `insert into public.tournaments (name, slug) values ('LIDE 2', 'lide-2') returning id`,
      )
    ).rows[0].id

    const stage = async (name: string, order: number) =>
      (
        await db.query<{ id: string }>(
          `insert into public.stages (tournament_id, name, kind, order_index)
           values ($1, $2, 'bracket', $3) returning id`,
          [tournamentId, name, order],
        )
      ).rows[0].id

    for (const name of ['Equipo A', 'Equipo B']) {
      team.set(
        name,
        (
          await db.query<{ id: string }>(
            `insert into public.teams (tournament_id, name, group_label)
             values ($1, $2, 'Grupo A') returning id`,
            [tournamentId, name],
          )
        ).rows[0].id,
      )
    }

    semi = (
      await db.query<{ id: string }>(
        `insert into public.series (stage_id, round, best_of, order_index)
         values ($1, 'Semifinales', 3, 1) returning id`,
        [await stage('Semifinales', 6)],
      )
    ).rows[0].id

    quarter = (
      await db.query<{ id: string }>(
        `insert into public.series
           (stage_id, round, best_of, order_index, next_series_id, next_slot, team_a_id, team_b_id)
         values ($1, 'Cuartos de final', 3, 1, $2, 'a', $3, $4) returning id`,
        [await stage('Cuartos de final', 5), semi, team.get('Equipo A'), team.get('Equipo B')],
      )
    ).rows[0].id
  })

  afterAll(async () => db?.close())

  it('counts a typed result in the score without a replay', async () => {
    expect(await enter(1, 'Equipo A')).toMatchObject({ ok: true })

    const result = await row(quarter)
    expect(Number(result.wins_a)).toBe(1)
    expect(Number(result.games_played)).toBe(1)
    expect(Number(result.live_games)).toBe(1)
    expect(result.status).toBe('playing')
  })

  it('moves the bracket on once a team has won the series', async () => {
    await enter(2, 'Equipo A')

    expect((await row(quarter)).winner_team_id).toBe(team.get('Equipo A'))
    expect((await row(semi)).team_a_id).toBe(team.get('Equipo A'))
  })

  it('refuses a third game once the series has a winner', async () => {
    expect(await enter(3, 'Equipo B')).toMatchObject({ ok: false, error: 'Esa serie ya tiene ganador.' })
  })

  it('lets the result of a game be corrected, and takes the bracket back with it', async () => {
    await enter(2, 'Equipo B')

    const result = await row(quarter)
    expect(result.winner_team_id).toBeNull()
    expect((await row(semi)).team_a_id).toBeNull()
  })

  it('takes a result back', async () => {
    await enter(2, null)

    expect(Number((await row(quarter)).games_played)).toBe(1)
  })

  it('does not count the game twice when its replay arrives', async () => {
    const filed = await file(1, 'Equipo A', 'Equipo B')

    expect(filed).toMatchObject({ ok: true, contradicts_result: false })

    const result = await row(quarter)
    expect(Number(result.games_played)).toBe(1)
    expect(Number(result.wins_a)).toBe(1)
    expect(Number(result.live_games)).toBe(0)

    const left = await db.query('select 1 from public.series_game_results where series_id = $1', [quarter])
    expect(left.rows).toHaveLength(0)
  })

  it('refuses a result for a game that already has its replay', async () => {
    expect(await enter(1, 'Equipo B')).toMatchObject({ ok: false })
  })

  it('says so when the replay disagrees with the typed result, and the replay wins', async () => {
    await enter(2, 'Equipo B')

    const filed = await file(2, 'Equipo A', 'Equipo B')

    expect(filed).toMatchObject({ ok: true, contradicts_result: true })

    const result = await row(quarter)
    expect(Number(result.wins_a)).toBe(2)
    expect(Number(result.wins_b)).toBe(0)
    expect(result.winner_team_id).toBe(team.get('Equipo A'))
  })

  it('is readable by visitors through the bracket view, not the raw table', async () => {
    await db.exec('set role anon')
    try {
      const view = await db.query('select games_played from public.series_results where id = $1', [quarter])
      expect(view.rows).toHaveLength(1)
      expect((await db.query('select * from public.series_game_results')).rows).toHaveLength(0)
    } finally {
      await db.exec('reset role')
    }
  })

  /* The home page shows the champion off the final's row alone. */
  it('crowns the champion of a BO5 final at 3-0 from typed results alone', async () => {
    const stage = (
      await db.query<{ id: string }>(
        `insert into public.stages (tournament_id, name, kind, order_index)
         values ($1, 'Gran final', 'bracket', 7) returning id`,
        [tournamentId],
      )
    ).rows[0].id
    const final = (
      await db.query<{ id: string }>(
        `insert into public.series (stage_id, round, best_of, order_index, team_a_id, team_b_id)
         values ($1, 'Gran final', 5, 1, $2, $3) returning id`,
        [stage, team.get('Equipo A'), team.get('Equipo B')],
      )
    ).rows[0].id

    for (const game of [1, 2, 3]) {
      await db.query('select public.set_game_result($1, $2::smallint, $3)', [
        final,
        game,
        team.get('Equipo B'),
      ])
    }

    const { rows } = await db.query<SeriesResultRow>(
      'select * from public.series_results where tournament_id = $1',
      [tournamentId],
    )

    expect(championOf(rows)).toBe('Equipo B')
    expect(championTeamId(rows)).toBe(team.get('Equipo B'))
    expect(finalScore(rows)).toBe('3-0')
  })
})
