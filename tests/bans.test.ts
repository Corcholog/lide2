import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from './helpers/db'
import { playScoreboard } from './helpers/matches'

/**
 * `set_match_bans`: saving a hand-entered draft (0021_meta_y_bans.sql). It must
 * replace the whole draft atomically and normalize champion spellings, or the
 * champion stats would split one champion in two.
 */

interface Ban {
  side: 100 | 200
  order_index: number
  champion: string
}

interface Result {
  ok: boolean
  error?: string
  bans?: number
}

/** A complete draft: five a side. */
const DRAFT: Ban[] = [
  { side: 100, order_index: 1, champion: 'Teemo' },
  { side: 100, order_index: 2, champion: 'Yasuo' },
  { side: 100, order_index: 3, champion: 'Zed' },
  { side: 100, order_index: 4, champion: 'Akali' },
  { side: 100, order_index: 5, champion: 'Katarina' },
  { side: 200, order_index: 1, champion: 'Draven' },
  { side: 200, order_index: 2, champion: 'Vayne' },
  { side: 200, order_index: 3, champion: 'Riven' },
  { side: 200, order_index: 4, champion: 'Irelia' },
  { side: 200, order_index: 5, champion: 'Camille' },
]

describe('entering bans', () => {
  let db: PGlite
  let matchId: string

  async function setBans(bans: Ban[], id = matchId): Promise<Result> {
    const { rows } = await db.query<{ result: Result }>(
      `select public.set_match_bans($1, $2::jsonb) as result`,
      [id, JSON.stringify(bans)],
    )
    return rows[0].result
  }

  async function savedBans(): Promise<{ side: number; order_index: number; champion: string }[]> {
    const { rows } = await db.query<{ side: number; order_index: number; champion: string }>(
      `select side, order_index, champion from public.match_bans
        where match_id = $1 order by side, order_index`,
      [matchId],
    )
    return rows
  }

  beforeAll(async () => {
    db = await createTestDb()

    const tournament = await db.query<{ id: string }>(
      `insert into public.tournaments (name, slug) values ('LIDE 2', 'lide-2') returning id`,
    )

    matchId = await playScoreboard(db, {
      tournamentId: tournament.rows[0].id,
      winner: 'blue',
      // Placed in the group phase, as every real match is. Since 0032 the stats
      // views drop rows whose phase cannot be resolved, so a match with no
      // labels would not reach `champion_meta` at all.
      stageLabel: 'Grupo A',
      roundLabel: 'Fecha 1',
      // "FiddleSticks" is the .rofl spelling (ddragon writes "Fiddlesticks"),
      // used by the normalization test below.
      blue: ['a', 'b', 'c', 'd', 'e'].map((p, i) => ({
        puuid: `azul-${p}`,
        champion: ['Garen', 'FiddleSticks', 'Lux', 'Jinx', 'Thresh'][i],
      })),
      red: ['a', 'b', 'c', 'd', 'e'].map((p) => ({ puuid: `rojo-${p}` })),
    })
  })

  beforeEach(async () => {
    await db.query('delete from public.match_bans where match_id = $1', [matchId])
  })

  it('stores all ten and returns them in order', async () => {
    const outcome = await setBans(DRAFT)

    expect(outcome.ok).toBe(true)
    expect(outcome.bans).toBe(10)

    const stored = await savedBans()
    expect(stored).toHaveLength(10)
    expect(stored[0]).toMatchObject({ side: 100, order_index: 1, champion: 'Teemo' })
    expect(stored[9]).toMatchObject({ side: 200, order_index: 5, champion: 'Camille' })
  })

  it('calling it twice does not duplicate', async () => {
    await setBans(DRAFT)
    await setBans(DRAFT)

    // Without replacing the whole draft this would violate the unique constraint
    // or leave twenty rows.
    expect(await savedBans()).toHaveLength(10)
  })

  it('sending fewer deletes the ones left over', async () => {
    await setBans(DRAFT)
    await setBans(DRAFT.slice(0, 3))

    expect(await savedBans()).toHaveLength(3)
  })

  it('an empty field is not stored: a team may pass on a ban', async () => {
    const outcome = await setBans([
      { side: 100, order_index: 1, champion: 'Teemo' },
      { side: 100, order_index: 2, champion: '   ' },
    ])

    expect(outcome.bans).toBe(1)
    expect(await savedBans()).toHaveLength(1)
  })

  it('honours the spelling the database already uses', async () => {
    // ddragon writes "Fiddlesticks" and the .rofl "FiddleSticks". Stored as sent,
    // the champion would appear twice in champion_meta, picks and bans split.
    await setBans([{ side: 100, order_index: 1, champion: 'Fiddlesticks' }])

    const stored = await savedBans()
    expect(stored[0].champion).toBe('FiddleSticks')

    /*
      One scope at a time: since 0030 the view has per-role rows (`all_roles`)
      and since 0032 a row for the whole tournament (`all_phases`), so a query
      that does not pin every dimension gets one row per scope. This one asks
      for the whole champion over the group phase, and checks it is a single
      row rather than one per spelling.
    */
    const { rows } = await db.query<{ picks: number; bans: number }>(
      `select picks, bans from public.champion_meta
        where not all_phases and all_groups and all_matchdays and all_roles
          and champion = 'FiddleSticks'`,
    )

    expect(rows).toHaveLength(1)
    expect(rows[0].picks).toBe(1)
    expect(rows[0].bans).toBe(1)
  })

  it('rejects a side that does not exist', async () => {
    const outcome = await setBans([
      { side: 300 as 100, order_index: 1, champion: 'Teemo' },
    ])

    expect(outcome.ok).toBe(false)
    expect(outcome.error).toContain('300')
    expect(await savedBans()).toHaveLength(0)
  })

  it('rejects an order outside 1 to 5', async () => {
    const outcome = await setBans([{ side: 100, order_index: 7, champion: 'Teemo' }])

    expect(outcome.ok).toBe(false)
    expect(outcome.error).toContain('7')
  })

  it('rejects the same champion twice', async () => {
    // The same champion cannot be banned twice in a draft; it usually means a
    // skipped slot.
    const outcome = await setBans([
      { side: 100, order_index: 1, champion: 'Teemo' },
      { side: 200, order_index: 1, champion: 'Teemo' },
    ])

    expect(outcome.ok).toBe(false)
    expect(outcome.error).toContain('Teemo')
    expect(await savedBans()).toHaveLength(0)
  })

  it('rejects a match that does not exist', async () => {
    const outcome = await setBans(DRAFT, '00000000-0000-0000-0000-000000000000')

    expect(outcome.ok).toBe(false)
    expect(outcome.error).toContain('no existe')
  })

  it('a rejection does not touch what was already entered', async () => {
    await setBans(DRAFT)
    await setBans([{ side: 100, order_index: 9, champion: 'Teemo' }])

    expect(await savedBans()).toHaveLength(10)
  })

  it('anon cannot execute it', async () => {
    await db.exec('set role anon')
    try {
      await expect(
        db.query(`select public.set_match_bans($1, '[]'::jsonb)`, [matchId]),
      ).rejects.toThrow(/permission denied|permiso denegado/i)
    } finally {
      await db.exec('reset role')
    }
  })
})
