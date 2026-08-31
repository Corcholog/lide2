import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from './helpers/db'
import { playScoreboard } from './helpers/matches'

/**
 * `set_match_bans`: cargar el draft a mano (0021_meta_y_bans.sql).
 *
 * El .rofl no guarda los baneos, asi que la unica forma de tenerlos es que
 * alguien los escriba. Esta funcion es la que recibe eso, y lo importante no es
 * que inserte —eso es facil— sino que reemplace el draft entero de forma
 * atomica y que no deje entrar grafias que despues partan el meta en dos.
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

/** Un draft completo: cinco por lado. */
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

describe('carga de bans', () => {
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
      // FiddleSticks con la S grande: es la grafia del .rofl, distinta de la
      // de ddragon. Es la trampa que prueba el test de mas abajo.
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

  it('guarda los diez y los devuelve en orden', async () => {
    const resultado = await setBans(DRAFT)

    expect(resultado.ok).toBe(true)
    expect(resultado.bans).toBe(10)

    const guardados = await bansGuardados()
    expect(guardados).toHaveLength(10)
    expect(guardados[0]).toMatchObject({ side: 100, order_index: 1, champion: 'Teemo' })
    expect(guardados[9]).toMatchObject({ side: 200, order_index: 5, champion: 'Camille' })
  })

  it('llamarla dos veces no duplica', async () => {
    await setBans(DRAFT)
    await setBans(DRAFT)

    // Sin el reemplazo entero esto reventaria contra el unique de la tabla, o
    // peor, dejaria veinte filas.
    expect(await bansGuardados()).toHaveLength(10)
  })

  it('mandar menos borra los que sobraban', async () => {
    await setBans(DRAFT)
    await setBans(DRAFT.slice(0, 3))

    expect(await bansGuardados()).toHaveLength(3)
  })

  it('un campo vacio no se guarda: un equipo puede pasar un ban', async () => {
    const resultado = await setBans([
      { side: 100, order_index: 1, champion: 'Teemo' },
      { side: 100, order_index: 2, champion: '   ' },
    ])

    expect(resultado.bans).toBe(1)
    expect(await bansGuardados()).toHaveLength(1)
  })

  it('respeta la grafia que ya usa la base', async () => {
    // ddragon dice "Fiddlesticks" y el .rofl escribe "FiddleSticks". Si se
    // guardara tal cual vino, el campeon saldria DOS VECES en champion_meta:
    // una fila con los picks y otra con los bans, cada una con la mitad de los
    // numeros y sin ninguna forma de darse cuenta.
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

  it('rechaza un lado que no existe', async () => {
    const resultado = await setBans([
      { side: 300 as 100, order_index: 1, champion: 'Teemo' },
    ])

    expect(resultado.ok).toBe(false)
    expect(resultado.error).toContain('300')
    expect(await bansGuardados()).toHaveLength(0)
  })

  it('rechaza un orden fuera de 1 a 5', async () => {
    const resultado = await setBans([{ side: 100, order_index: 7, champion: 'Teemo' }])

    expect(resultado.ok).toBe(false)
    expect(resultado.error).toContain('7')
  })

  it('rechaza el mismo campeon dos veces', async () => {
    // En un draft no se puede banear dos veces al mismo: casi siempre es que
    // quien carga se salteo un casillero.
    const resultado = await setBans([
      { side: 100, order_index: 1, champion: 'Teemo' },
      { side: 200, order_index: 1, champion: 'Teemo' },
    ])

    expect(resultado.ok).toBe(false)
    expect(resultado.error).toContain('Teemo')
    expect(await bansGuardados()).toHaveLength(0)
  })

  it('rechaza una partida que no existe', async () => {
    const resultado = await setBans(DRAFT, '00000000-0000-0000-0000-000000000000')

    expect(resultado.ok).toBe(false)
    expect(resultado.error).toContain('no existe')
  })

  it('un rechazo no toca lo que ya estaba cargado', async () => {
    await setBans(DRAFT)
    await setBans([{ side: 100, order_index: 9, champion: 'Teemo' }])

    expect(await bansGuardados()).toHaveLength(10)
  })

  it('anon no la puede ejecutar', async () => {
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
