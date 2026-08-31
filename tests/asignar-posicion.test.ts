import type { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from './helpers/db'
import { playScoreboard } from './helpers/matches'

/**
 * Decir a mano en qué línea juega una cuenta.
 *
 * El caso es el mismo que el del alta manual (0017) y el emparejado manual
 * (0019): antes de la fecha 1 no hay ni una partida de la que deducir nada, y
 * quien cargó los nicks del equipo ya sabe quién juega dónde porque se lo
 * dijeron en la inscripción.
 */

interface AssignResult {
  ok: boolean
  error?: string
  name?: string
  role?: string | null
}

interface SlotRow {
  slot: number
  role: string | null
  player_id: string | null
  name: string | null
  assigned_role: string | null
}

describe('asignar a mano la línea de una cuenta', () => {
  let db: PGlite
  let equipo01: string
  const cuenta = new Map<string, string>()

  // Las migraciones enteras por test: Postgres en WASM tarda, y el default de
  // vitest para un hook son 10 segundos.
  beforeEach(async () => {
    db = await createTestDb()

    const teams = await db.query<{ id: string }>(
      `insert into public.teams (name) values ('Equipo 01') returning id`,
    )
    equipo01 = teams.rows[0].id

    for (const [nick, tag] of [
      ['Corcho', 'fkc'],
      ['Pachu', '777'],
    ] as const) {
      const { rows } = await db.query<{ add_team_account: { player_id: string } }>(
        'select public.add_team_account($1, $2, $3)',
        [equipo01, nick, tag],
      )
      cuenta.set(nick, rows[0].add_team_account.player_id)
    }
  }, 60_000)

  afterEach(async () => {
    await db?.close()
  })

  async function asignar(playerId: string, role: string | null): Promise<AssignResult> {
    const { rows } = await db.query<{ assign_team_member_role: AssignResult }>(
      'select public.assign_team_member_role($1, $2, $3)',
      [equipo01, playerId, role],
    )
    return rows[0].assign_team_member_role
  }

  async function plantel(): Promise<SlotRow[]> {
    const { rows } = await db.query<SlotRow>(
      `select slot, role, player_id, name, assigned_role
         from public.team_lineup where team_id = $1 order by slot`,
      [equipo01],
    )
    return rows
  }

  it('sin ninguna partida jugada, asignar la línea llena el casillero', async () => {
    const result = await asignar(cuenta.get('Corcho')!, 'TOP')
    expect(result.ok).toBe(true)
    expect(result.name).toBe('Corcho')

    const rows = await plantel()
    const top = rows.find((r) => r.slot === 1)!
    expect(top.role).toBe('TOP')
    expect(top.player_id).toBe(cuenta.get('Corcho'))
    expect(top.assigned_role).toBe('TOP')

    // Las otras cuatro líneas siguen vacías, y Pachu —que no tiene nada
    // asignado ni jugó— queda en la pool sin línea.
    expect(rows.filter((r) => r.role !== null && r.player_id !== null)).toHaveLength(1)
    expect(rows.filter((r) => r.role === null && r.player_id !== null)).toEqual([
      expect.objectContaining({ player_id: cuenta.get('Pachu'), assigned_role: null }),
    ])
  })

  it('acepta la posición en minúscula, como la escribiría alguien a mano', async () => {
    const result = await asignar(cuenta.get('Corcho')!, 'support')
    expect(result.ok).toBe(true)
    expect(result.role).toBe('SUPPORT')
  })

  it('rechaza una línea que no existe', async () => {
    const result = await asignar(cuenta.get('Corcho')!, 'CARRY')
    expect(result.ok).toBe(false)
    expect(result.error).toBe('Esa posición no existe.')
  })

  it('rechaza una cuenta que no es de este equipo', async () => {
    const otroEquipo = await db.query<{ id: string }>(
      `insert into public.teams (name) values ('Equipo 02') returning id`,
    )
    const { rows } = await db.query<{ add_team_account: { player_id: string } }>(
      'select public.add_team_account($1, $2, $3)',
      [otroEquipo.rows[0].id, 'DeOtroLado', 'xyz'],
    )
    const ajena = rows[0].add_team_account.player_id

    const result = await asignar(ajena, 'TOP')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('no está en el plantel')
  })

  it('a mano le gana a lo deducido de las partidas', async () => {
    // Alguien jugó top de verdad. Se lo suma al plantel a mano: es lo que hace
    // `assign_match_to_fixture()` en la vida real (0012_planteles.sql); acá se
    // salta el fixture entero porque no es lo que se está probando.
    await playScoreboard(db, {
      blueTeamId: equipo01,
      winner: 'blue',
      blue: [
        { puuid: 'p-corcho', position: 'TOP' },
        { puuid: 'p2', position: 'JUNGLE' },
        { puuid: 'p3', position: 'MIDDLE' },
        { puuid: 'p4', position: 'BOTTOM' },
        { puuid: 'p5', position: 'SUPPORT' },
      ],
      red: ['r1', 'r2', 'r3', 'r4', 'r5'].map((puuid) => ({ puuid })),
    })

    const { rows: jugador } = await db.query<{ id: string }>(
      `select id from public.players where puuid = 'p-corcho'`,
    )
    const queJugoTop = jugador[0].id

    await db.query(`insert into public.team_members (team_id, player_id) values ($1, $2)`, [
      equipo01,
      queJugoTop,
    ])

    const antes = await plantel()
    expect(antes.find((r) => r.slot === 1)!.player_id).toBe(queJugoTop)

    // Pero el equipo avisa que en realidad juega de soporte.
    await asignar(queJugoTop, 'SUPPORT')

    const despues = await plantel()
    expect(despues.find((r) => r.slot === 5)!.player_id).toBe(queJugoTop)
    expect(despues.find((r) => r.slot === 1)!.player_id).not.toBe(queJugoTop)
  })

  it('dos cuentas asignadas a la misma línea: una gana, la otra cae al banco', async () => {
    await asignar(cuenta.get('Corcho')!, 'TOP')
    await asignar(cuenta.get('Pachu')!, 'TOP')

    const rows = await plantel()
    const top = rows.find((r) => r.slot === 1)!
    const banco = rows.filter((r) => r.role === null && r.player_id !== null)

    expect(banco).toHaveLength(1)
    expect([top.player_id, banco[0]?.player_id].sort()).toEqual(
      [cuenta.get('Corcho'), cuenta.get('Pachu')].sort(),
    )
  })

  it('el Equipo 01 de verdad: cinco nicks cargados a mano quedan en la formación', async () => {
    // Cinco anotados en la planilla y cinco nicks sin una sola partida: el
    // plantel entero era una pool sin línea, que es de donde salió todo esto.
    for (const [index, nombre] of ['Uno', 'Dos', 'Tres', 'Cuatro', 'Cinco'].entries()) {
      await db.query(
        `insert into public.team_roster (team_id, full_name, order_index) values ($1, $2, $3)`,
        [equipo01, nombre, index],
      )
    }
    for (const [nick, tag] of [
      ['LIDE CHAMPION', 'fkc'],
      ['we1rdcat', 'uwu'],
      ['the strange case', 'fkc'],
    ] as const) {
      const { rows } = await db.query<{ add_team_account: { player_id: string } }>(
        'select public.add_team_account($1, $2, $3)',
        [equipo01, nick, tag],
      )
      cuenta.set(nick, rows[0].add_team_account.player_id)
    }

    const antes = await plantel()
    expect(antes.filter((r) => r.role === null && r.player_id !== null)).toHaveLength(5)

    const lineas = [
      ['LIDE CHAMPION', 'TOP'],
      ['Corcho', 'JUNGLE'],
      ['Pachu', 'MIDDLE'],
      ['we1rdcat', 'BOTTOM'],
      ['the strange case', 'SUPPORT'],
    ] as const
    for (const [nick, role] of lineas) await asignar(cuenta.get(nick)!, role)

    // Los cinco en su línea y ni una fila de más: el banco se vacía solo.
    const despues = await plantel()
    expect(despues).toHaveLength(5)
    expect(despues.map((r) => [r.role, r.name])).toEqual([
      ['TOP', 'LIDE CHAMPION'],
      ['JUNGLE', 'Corcho'],
      ['MIDDLE', 'Pachu'],
      ['BOTTOM', 'we1rdcat'],
      ['SUPPORT', 'the strange case'],
    ])
  })

  it('limpiar la asignación (null) devuelve el casillero a "por confirmar"', async () => {
    await asignar(cuenta.get('Corcho')!, 'TOP')
    const result = await asignar(cuenta.get('Corcho')!, null)

    expect(result.ok).toBe(true)
    expect(result.role).toBeNull()

    const rows = await plantel()
    expect(rows.find((r) => r.slot === 1)!.player_id).toBeNull()
    // La cuenta sigue en el plantel, ahora en el banco sin línea.
    expect(rows.some((r) => r.player_id === cuenta.get('Corcho'))).toBe(true)
  })
})
