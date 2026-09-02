import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from './helpers/db'
import { playScoreboard } from './helpers/matches'

/**
 * `set_match_bans`: entering the draft by hand (0021_meta_y_bans.sql).
 *
 * The .rofl does not store the bans, so the only way to have them is for
 * somebody to type them. This function is what receives that, and what matters
 * is not that it inserts - that is easy - but that it replaces the whole draft
 * atomically and does not let in spellings that later split the meta in two.
 */

interface Ban {
  side: 100 | 200
  order_index: number
  champion: string
}

interface Resultado {
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

  async function setBans(bans: Ban[], id = matchId): Promise<Resultado> {
    const { rows } = await db.query<{ result: Resultado }>(
      `select public.set_match_bans($1, $2::jsonb) as result`,
      [id, JSON.stringify(bans)],
    )
    return rows[0].result
  }

  async function bansGuardados(): Promise<{ side: number; order_index: number; champion: string }[]> {
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
      // FiddleSticks with the capital S: it is the .rofl's spelling, different
      // from ddragon's. It is the trap the test further down exercises.
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
    const resultado = await setBans(DRAFT)

    expect(resultado.ok).toBe(true)
    expect(resultado.bans).toBe(10)

    const guardados = await bansGuardados()
    expect(guardados).toHaveLength(10)
    expect(guardados[0]).toMatchObject({ side: 100, order_index: 1, champion: 'Teemo' })
    expect(guardados[9]).toMatchObject({ side: 200, order_index: 5, champion: 'Camille' })
  })

  it('calling it twice does not duplicate', async () => {
    await setBans(DRAFT)
    await setBans(DRAFT)

    // Without replacing the lot this would blow up against the table's unique
    // constraint, or worse, leave twenty rows behind.
    expect(await bansGuardados()).toHaveLength(10)
  })

  it('sending fewer deletes the ones left over', async () => {
    await setBans(DRAFT)
    await setBans(DRAFT.slice(0, 3))

    expect(await bansGuardados()).toHaveLength(3)
  })

  it('an empty field is not stored: a team may pass on a ban', async () => {
    const resultado = await setBans([
      { side: 100, order_index: 1, champion: 'Teemo' },
      { side: 100, order_index: 2, champion: '   ' },
    ])

    expect(resultado.bans).toBe(1)
    expect(await bansGuardados()).toHaveLength(1)
  })

  it('honours the spelling the database already uses', async () => {
    // ddragon says "Fiddlesticks" and the .rofl writes "FiddleSticks". Stored
    // exactly as it came, the champion would appear TWICE in champion_meta: one
    // row with the picks and another with the bans, each with half the numbers
    // and no way of noticing.
    await setBans([{ side: 100, order_index: 1, champion: 'Fiddlesticks' }])

    const guardados = await bansGuardados()
    expect(guardados[0].champion).toBe('FiddleSticks')

    const { rows } = await db.query<{ picks: number; bans: number }>(
      `select picks, bans from public.champion_meta
        where all_groups and all_matchdays and champion = 'FiddleSticks'`,
    )

    expect(rows).toHaveLength(1)
    expect(rows[0].picks).toBe(1)
    expect(rows[0].bans).toBe(1)
  })

  it('rejects a side that does not exist', async () => {
    const resultado = await setBans([
      { side: 300 as 100, order_index: 1, champion: 'Teemo' },
    ])

    expect(resultado.ok).toBe(false)
    expect(resultado.error).toContain('300')
    expect(await bansGuardados()).toHaveLength(0)
  })

  it('rejects an order outside 1 to 5', async () => {
    const resultado = await setBans([{ side: 100, order_index: 7, champion: 'Teemo' }])

    expect(resultado.ok).toBe(false)
    expect(resultado.error).toContain('7')
  })

  it('rejects the same champion twice', async () => {
    // In a draft the same champion cannot be banned twice: nearly always it
    // means whoever is entering them skipped a slot.
    const resultado = await setBans([
      { side: 100, order_index: 1, champion: 'Teemo' },
      { side: 200, order_index: 1, champion: 'Teemo' },
    ])

    expect(resultado.ok).toBe(false)
    expect(resultado.error).toContain('Teemo')
    expect(await bansGuardados()).toHaveLength(0)
  })

  it('rejects a match that does not exist', async () => {
    const resultado = await setBans(DRAFT, '00000000-0000-0000-0000-000000000000')

    expect(resultado.ok).toBe(false)
    expect(resultado.error).toContain('no existe')
  })

  it('a rejection does not touch what was already entered', async () => {
    await setBans(DRAFT)
    await setBans([{ side: 100, order_index: 9, champion: 'Teemo' }])

    expect(await bansGuardados()).toHaveLength(10)
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
