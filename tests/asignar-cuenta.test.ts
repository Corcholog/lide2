import type { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from './helpers/db'

/**
 * Decir a mano de quién es una cuenta.
 *
 * El caso es el del Equipo 01 antes de la fecha 1: los cinco nicks cargados a
 * mano, los cinco inscriptos de la planilla, y nadie que haya jugado todavía.
 * El emparejado automático necesita que la planilla traiga el Riot ID; cuando
 * no lo trae, esto es lo único que cierra el vínculo.
 */

interface AssignResult {
  ok: boolean
  error?: string
  name?: string
  nick?: string
  cleared?: boolean
}

describe('asignar una cuenta a un inscripto', () => {
  let db: PGlite
  let equipo01: string
  let equipo19: string
  const inscripto = new Map<string, string>()
  const cuenta = new Map<string, string>()

  // Las migraciones enteras por test: Postgres en WASM tarda, y el default de
  // vitest para un hook son 10 segundos.
  beforeEach(async () => {
    db = await createTestDb()

    const teams = await db.query<{ id: string; name: string }>(
      `insert into public.teams (name) values ('Equipo 01'), ('Equipo 19') returning id, name`,
    )
    equipo01 = teams.rows.find((row) => row.name === 'Equipo 01')!.id
    equipo19 = teams.rows.find((row) => row.name === 'Equipo 19')!.id

    // La planilla del 01, sin Riot ID declarado: es el caso en que el
    // emparejado automático no tiene con qué.
    for (const [index, nombre] of ['Marcelo Condori', 'Facundo Subijana'].entries()) {
      const { rows } = await db.query<{ id: string }>(
        `insert into public.team_roster (team_id, full_name, order_index)
         values ($1, $2, $3) returning id`,
        [equipo01, nombre, index],
      )
      inscripto.set(nombre, rows[0].id)
    }

    for (const [team, nick, tag] of [
      [equipo01, 'LIDE CHAMPION', 'fkc'],
      [equipo01, 'Pachu', '777'],
      [equipo19, 'Azael', '026'],
    ] as const) {
      const { rows } = await db.query<{ add_team_account: { player_id: string } }>(
        'select public.add_team_account($1, $2, $3)',
        [team, nick, tag],
      )
      cuenta.set(nick, rows[0].add_team_account.player_id)
    }
  }, 60_000)

  afterEach(async () => {
    await db?.close()
  })

  async function asignar(rosterId: string, playerId: string | null): Promise<AssignResult> {
    const { rows } = await db.query<{ assign_roster_account: AssignResult }>(
      'select public.assign_roster_account($1, $2)',
      [rosterId, playerId],
    )
    return rows[0].assign_roster_account
  }

  async function cuentaDe(nombre: string): Promise<string | null> {
    const { rows } = await db.query<{ player_id: string | null }>(
      'select player_id from public.team_roster where id = $1',
      [inscripto.get(nombre)],
    )
    return rows[0].player_id
  }

  it('empareja un nick cargado a mano con su dueño', async () => {
    const result = await asignar(inscripto.get('Marcelo Condori')!, cuenta.get('LIDE CHAMPION')!)

    expect(result.ok).toBe(true)
    expect(result.nick).toBe('LIDE CHAMPION#fkc')
    expect(result.name).toBe('Marcelo Condori')
    expect(await cuentaDe('Marcelo Condori')).toBe(cuenta.get('LIDE CHAMPION'))
  })

  it('lo deja verse en roster_status, con la cuenta y sin partidas', async () => {
    await asignar(inscripto.get('Facundo Subijana')!, cuenta.get('Pachu')!)

    const { rows } = await db.query<{
      linked_game_name: string
      linked_tag_line: string
      declared_game_name: string | null
      games: number
    }>(
      `select linked_game_name, linked_tag_line, declared_game_name, games
         from public.roster_status where roster_id = $1`,
      [inscripto.get('Facundo Subijana')],
    )

    expect(rows[0].linked_game_name).toBe('Pachu')
    expect(rows[0].linked_tag_line).toBe('777')
    expect(Number(rows[0].games)).toBe(0)
    // El emparejado no inventa lo que la planilla no declaró.
    expect(rows[0].declared_game_name).toBeNull()
  })

  it('no acepta una cuenta de otro equipo', async () => {
    const result = await asignar(inscripto.get('Marcelo Condori')!, cuenta.get('Azael')!)

    expect(result.ok).toBe(false)
    expect(result.error).toContain('no esta en el plantel')
    expect(await cuentaDe('Marcelo Condori')).toBeNull()
  })

  it('no le saca la cuenta a otro inscripto: dice de quién es', async () => {
    await asignar(inscripto.get('Marcelo Condori')!, cuenta.get('Pachu')!)
    const result = await asignar(inscripto.get('Facundo Subijana')!, cuenta.get('Pachu')!)

    expect(result.ok).toBe(false)
    expect(result.error).toBe('Pachu#777 ya es de Marcelo Condori.')
    expect(await cuentaDe('Marcelo Condori')).toBe(cuenta.get('Pachu'))
    expect(await cuentaDe('Facundo Subijana')).toBeNull()
  })

  it('desasigna con null, que es como se deshace un emparejado equivocado', async () => {
    await asignar(inscripto.get('Marcelo Condori')!, cuenta.get('Pachu')!)
    const result = await asignar(inscripto.get('Marcelo Condori')!, null)

    expect(result.ok).toBe(true)
    expect(result.cleared).toBe(true)
    expect(await cuentaDe('Marcelo Condori')).toBeNull()

    // Y la cuenta queda libre para el que sí es.
    const otra = await asignar(inscripto.get('Facundo Subijana')!, cuenta.get('Pachu')!)
    expect(otra.ok).toBe(true)
  })

  it('cambiar de cuenta al mismo inscripto reemplaza la que tenía', async () => {
    await asignar(inscripto.get('Marcelo Condori')!, cuenta.get('Pachu')!)
    const result = await asignar(inscripto.get('Marcelo Condori')!, cuenta.get('LIDE CHAMPION')!)

    expect(result.ok).toBe(true)
    expect(await cuentaDe('Marcelo Condori')).toBe(cuenta.get('LIDE CHAMPION'))
  })

  it('no escribe nada si el inscripto no existe', async () => {
    const result = await asignar(
      '00000000-0000-0000-0000-000000000000',
      cuenta.get('LIDE CHAMPION')!,
    )

    expect(result.ok).toBe(false)
    expect(result.error).toBe('Ese inscripto no existe.')
  })

  it('el emparejado a mano le gana al automático: link_roster_accounts no lo pisa', async () => {
    await asignar(inscripto.get('Marcelo Condori')!, cuenta.get('Pachu')!)

    // La planilla decía otra cosa, y se carga después.
    await db.query(
      `update public.team_roster
          set riot_game_name = 'LIDE CHAMPION', riot_tag_line = 'fkc'
        where id = $1`,
      [inscripto.get('Marcelo Condori')],
    )
    await db.query('select public.link_roster_accounts($1)', [equipo01])

    expect(await cuentaDe('Marcelo Condori')).toBe(cuenta.get('Pachu'))
  })
})
