import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb } from './helpers/db'
import { playScoreboard } from './helpers/matches'
import { championOf, seriesWinner } from '@/lib/lide2/winner'
import type { SeriesResultRow } from '@/types/db'

/*
 * The bracket from the quarter-finals to the champion (0006, 0033, 0034).
 *
 * Each series carries the one its winner goes to, so nobody types a semifinal
 * or the final: filing a replay under its series is the whole job, and the
 * trigger fills the next round. Every hop of that chain is tested on its own
 * elsewhere; this plays the shape the seed creates — four BO3 quarter-finals,
 * two BO3 semifinals, a BO5 final — in one go, because it runs while the
 * tournament is on and a bracket stuck halfway is not something to find out
 * then.
 */

const QUARTERS = 'Cuartos de final'
const SEMIS = 'Semifinales'
const FINAL = 'Gran final'

describe('the playoff bracket', () => {
  let db: PGlite
  let tournamentId: string
  const team = new Map<string, string>()
  const series = new Map<string, string>()

  const five = (prefix: string) =>
    [1, 2, 3, 4, 5].map((n) => ({ puuid: `${prefix}-${n}`, position: 'MIDDLE' }))

  /** The bracket as the site reads it: the view, in bracket order. */
  async function bracket(): Promise<SeriesResultRow[]> {
    const { rows } = await db.query<SeriesResultRow>(
      `select * from public.series_results
        where tournament_id = $1 order by stage_order, order_index`,
      [tournamentId],
    )
    return rows
  }

  const find = (rows: SeriesResultRow[], round: string, order: number) =>
    rows.find((row) => row.round === round && row.order_index === order)!

  /** One game: upload the replay, then file it under its series and number. */
  async function play(key: string, winnerName: string, loserName: string, game: number) {
    const matchId = await playScoreboard(db, {
      tournamentId,
      blueTeamId: team.get(winnerName),
      redTeamId: team.get(loserName),
      winner: 'blue',
      blue: five(winnerName),
      red: five(loserName),
    })

    const { rows } = await db.query<{ result: { ok: boolean; error?: string } }>(
      'select public.assign_match_to_series($1, $2, $3, $4) as result',
      [matchId, series.get(key), team.get(winnerName), game],
    )

    // A refusal here would leave the game out of the series without saying so.
    expect(rows[0].result).toMatchObject({ ok: true })
    return matchId
  }

  /** A series nobody turned up to, which also has to move the bracket on. */
  async function award(key: string, teamName: string) {
    const { rows } = await db.query<{ result: { ok: boolean } }>(
      'select public.set_series_walkover($1, $2) as result',
      [series.get(key), team.get(teamName)],
    )
    expect(rows[0].result).toMatchObject({ ok: true })
  }

  beforeAll(async () => {
    db = await createTestDb()

    const tournament = await db.query<{ id: string }>(
      `insert into public.tournaments (name, slug) values ('LIDE 2', 'lide-2') returning id`,
    )
    tournamentId = tournament.rows[0].id

    const stage = async (name: string, order: number) =>
      (
        await db.query<{ id: string }>(
          `insert into public.stages (tournament_id, name, kind, order_index)
           values ($1, $2, 'bracket', $3) returning id`,
          [tournamentId, name, order],
        )
      ).rows[0].id

    const stageId = new Map([
      [QUARTERS, await stage(QUARTERS, 5)],
      [SEMIS, await stage(SEMIS, 6)],
      [FINAL, await stage(FINAL, 7)],
    ])

    for (let n = 1; n <= 8; n++) {
      const name = `Equipo 0${n}`
      const { rows } = await db.query<{ id: string }>(
        `insert into public.teams (tournament_id, name, group_label)
         values ($1, $2, $3) returning id`,
        [tournamentId, name, `Grupo ${'ABCD'[(n - 1) % 4]}`],
      )
      team.set(name, rows[0].id)
    }

    /*
      Built backwards, as createBracket() in scripts/seed-lide2.ts does: a
      series names the one it feeds, so that one has to exist first.
    */
    const insert = async (
      stageName: string,
      round: string,
      bestOf: number,
      order: number,
      next?: { id: string; slot: 'a' | 'b' },
    ) =>
      (
        await db.query<{ id: string }>(
          `insert into public.series
             (stage_id, round, best_of, order_index, next_series_id, next_slot)
           values ($1, $2, $3, $4, $5, $6) returning id`,
          [stageId.get(stageName), round, bestOf, order, next?.id ?? null, next?.slot ?? null],
        )
      ).rows[0].id

    const final = await insert(FINAL, FINAL, 5, 1)
    series.set('final', final)

    for (const order of [1, 2] as const) {
      series.set(
        `semi${order}`,
        await insert(SEMIS, SEMIS, 3, order, { id: final, slot: order === 1 ? 'a' : 'b' }),
      )
    }

    for (const order of [1, 2, 3, 4] as const) {
      series.set(
        `q${order}`,
        await insert(QUARTERS, QUARTERS, 3, order, {
          id: series.get(order <= 2 ? 'semi1' : 'semi2')!,
          slot: order % 2 === 1 ? 'a' : 'b',
        }),
      )
    }

    /*
      The draw, the one thing typed in by hand (/admin/cruces). Everything
      after this point the bracket does by itself.
    */
    const draw: [string, string, string][] = [
      ['q1', 'Equipo 01', 'Equipo 02'],
      ['q2', 'Equipo 03', 'Equipo 04'],
      ['q3', 'Equipo 05', 'Equipo 06'],
      ['q4', 'Equipo 07', 'Equipo 08'],
    ]

    for (const [key, a, b] of draw) {
      await db.query('update public.series set team_a_id = $2, team_b_id = $3 where id = $1', [
        series.get(key),
        team.get(a),
        team.get(b),
      ])
    }
  })

  afterAll(async () => db?.close())

  it('waits with an empty semifinal and an empty final', async () => {
    const rows = await bracket()

    expect(find(rows, SEMIS, 1).team_a_id).toBeNull()
    expect(find(rows, FINAL, 1).team_b_id).toBeNull()
    expect(championOf(rows)).toBeUndefined()
  })

  it('fills the semifinals from the quarter-finals, nobody typing a name', async () => {
    // 2-0, 2-1 after losing the first, a no-show, and another 2-0.
    await play('q1', 'Equipo 01', 'Equipo 02', 1)
    await play('q1', 'Equipo 01', 'Equipo 02', 2)

    await play('q2', 'Equipo 04', 'Equipo 03', 1)
    await play('q2', 'Equipo 03', 'Equipo 04', 2)
    await play('q2', 'Equipo 03', 'Equipo 04', 3)

    await award('q3', 'Equipo 05')

    await play('q4', 'Equipo 07', 'Equipo 08', 1)
    await play('q4', 'Equipo 07', 'Equipo 08', 2)

    const rows = await bracket()

    expect(find(rows, QUARTERS, 2).status).toBe('finished')
    expect(Number(find(rows, QUARTERS, 2).wins_a)).toBe(2)
    expect(Number(find(rows, QUARTERS, 2).wins_b)).toBe(1)

    // The awarded one: its winner goes through with no games behind it.
    expect(find(rows, QUARTERS, 3).status).toBe('w.o.')
    expect(Number(find(rows, QUARTERS, 3).games_played)).toBe(0)

    expect([
      find(rows, SEMIS, 1).team_a_name,
      find(rows, SEMIS, 1).team_b_name,
      find(rows, SEMIS, 2).team_a_name,
      find(rows, SEMIS, 2).team_b_name,
    ]).toEqual(['Equipo 01', 'Equipo 03', 'Equipo 05', 'Equipo 07'])
  })

  it('takes a replay for a series it filled itself', async () => {
    await play('semi1', 'Equipo 03', 'Equipo 01', 1)
    await play('semi1', 'Equipo 01', 'Equipo 03', 2)
    await play('semi1', 'Equipo 03', 'Equipo 01', 3)

    await play('semi2', 'Equipo 05', 'Equipo 07', 1)
    await play('semi2', 'Equipo 05', 'Equipo 07', 2)

    const rows = await bracket()

    expect(seriesWinner(find(rows, SEMIS, 1))).toBe('Equipo 03')
    expect(seriesWinner(find(rows, SEMIS, 2))).toBe('Equipo 05')
    expect(find(rows, FINAL, 1).team_a_name).toBe('Equipo 03')
    expect(find(rows, FINAL, 1).team_b_name).toBe('Equipo 05')
  })

  /* The final is a BO5, so a fifth game has to be allowed where a BO3's is not. */
  it('crowns the champion on the fifth game of the final', async () => {
    await play('final', 'Equipo 05', 'Equipo 03', 1)
    await play('final', 'Equipo 03', 'Equipo 05', 2)
    await play('final', 'Equipo 05', 'Equipo 03', 3)
    await play('final', 'Equipo 03', 'Equipo 05', 4)

    // Four games in, 2-2: a BO5 is won with three.
    expect(find(await bracket(), FINAL, 1).status).toBe('playing')

    await play('final', 'Equipo 03', 'Equipo 05', 5)

    const rows = await bracket()
    const final = find(rows, FINAL, 1)

    expect(final.status).toBe('finished')
    expect(Number(final.games_played)).toBe(5)
    expect(championOf(rows)).toBe('Equipo 03')
  })

  /*
   * What /partidas reads, which is also what the stat scopes filter on. A
   * playoff game that never got its round is in no scope at all, and its row
   * says nothing but the patch.
   */
  it('leaves every game filed under its round, numbered', async () => {
    const { rows } = await db.query<{ round_label: string; games: number; numbers: string }>(
      `select round_label, count(*)::int as games,
              string_agg(distinct game_number::text, ',' order by game_number::text) as numbers
         from public.match_summaries
        where tournament_id = $1 and phase = 'playoffs'
        group by round_label order by round_label`,
      [tournamentId],
    )

    expect(rows).toEqual([
      { round_label: QUARTERS, games: 7, numbers: '1,2,3' },
      { round_label: FINAL, games: 5, numbers: '1,2,3,4,5' },
      { round_label: SEMIS, games: 5, numbers: '1,2,3' },
    ])
  })

  it('leaves nothing waiting in the panel', async () => {
    const { rows } = await db.query<{ n: number }>(
      'select count(*)::int as n from public.unassigned_matches',
    )

    expect(rows[0].n).toBe(0)
  })
})
