import type { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from './helpers/db'
import { playScoreboard } from './helpers/matches'

/**
 * El plantel que ve un visitante.
 *
 * `team_lineup` devuelve casilleros, no jugadores: los cinco roles están
 * siempre y el banco sale de cuántos anotó el equipo en la planilla. El nick
 * aparece en su lugar cuando la persona jugó; hasta entonces el lugar queda
 * vacío y la página lo dibuja con el nombre del rol.
 */

interface SlotRow {
  slot: number
  role: string | null
  sub_number: number | null
  is_substitute: boolean
  player_id: string | null
  name: string | null
  games: number
}

describe('plantel', () => {
  let db: PGlite
  let tournamentId: string
  let equipo01: string
  let equipo07: string
  let universityId: string
  const cruce: string[] = []

  beforeEach(async () => {
    db = await createTestDb()

    const tournament = await db.query<{ id: string }>(
      `insert into public.tournaments (name, slug) values ('LIDE 2', 'lide-2') returning id`,
    )
    tournamentId = tournament.rows[0].id

    const university = await db.query<{ id: string }>(
      `insert into public.universities (name, tag) values ('Universidad Nacional de La Plata', 'UNLP')
       returning id`,
    )
    universityId = university.rows[0].id

    const teams = await db.query<{ id: string; name: string }>(
      `insert into public.teams (tournament_id, name, group_label, university_id)
       values ($1, 'Equipo 01', 'Grupo A', $2), ($1, 'Equipo 07', 'Grupo A', $2)
       returning id, name`,
      [tournamentId, universityId],
    )
    equipo01 = teams.rows.find((row) => row.name === 'Equipo 01')!.id
    equipo07 = teams.rows.find((row) => row.name === 'Equipo 07')!.id

    for (const matchday of [1, 2, 3]) {
      const { rows } = await db.query<{ id: string }>(
        `insert into public.fixtures
           (tournament_id, group_label, matchday, slot, kickoff, team_a_id, team_b_id)
         values ($1, 'Grupo A', $2, 1, '2026-09-05T17:00:00Z', $3, $4)
         returning id`,
        [tournamentId, matchday, equipo01, equipo07],
      )
      cruce.push(rows[0].id)
    }
  }, 60_000)

  afterEach(async () => {
    cruce.length = 0
    await db?.close()
  })

  /** Anota gente en la planilla del Equipo 01. Nombres legales, como en la vida. */
  async function anotar(...names: string[]) {
    for (const [index, name] of names.entries()) {
      await db.query(
        `insert into public.team_roster (team_id, full_name, university_id, order_index)
         values ($1, $2, $3, $4)`,
        [equipo01, name, universityId, index],
      )
    }
  }

  /**
   * Juega una fecha: los cinco nicks del Equipo 01 en el orden de las líneas y
   * cinco descartables del otro lado. Asignar el cruce es lo que le enseña a la
   * base quién juega en cada equipo.
   */
  async function jugarFecha(matchday: number, nicks: string[]) {
    const matchId = await playScoreboard(db, {
      winner: 'blue',
      blue: nicks.map((nick) => ({ puuid: `puuid-${nick}`, kills: 2, deaths: 1, assists: 3 })),
      red: ['r1', 'r2', 'r3', 'r4', 'r5'].map((puuid) => ({ puuid, kills: 1, deaths: 2 })),
    })

    for (const nick of nicks) {
      await db.query(`update public.players set riot_game_name = $1 where puuid = $2`, [
        nick,
        `puuid-${nick}`,
      ])
    }

    await db.query('select public.assign_match_to_fixture($1, $2, $3)', [
      matchId,
      cruce[matchday - 1],
      equipo01,
    ])

    return matchId
  }

  async function plantel(teamId: string): Promise<SlotRow[]> {
    const { rows } = await db.query<SlotRow>(
      `select slot, role, sub_number, is_substitute, player_id, name, games
         from public.team_lineup where team_id = $1 order by slot`,
      [teamId],
    )
    return rows.map((row) => ({ ...row, games: Number(row.games) }))
  }

  it('los cinco lugares existen antes de que se suba un solo replay', async () => {
    const rows = await plantel(equipo07)

    expect(rows.map((r) => r.role)).toEqual(['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'SUPPORT'])
    expect(rows.every((r) => r.player_id === null)).toBe(true)
    expect(rows.every((r) => r.is_substitute === false)).toBe(true)
  })

  it('cada nick cae en la línea que jugó', async () => {
    await jugarFecha(1, ['Alfa', 'Bravo', 'Charlie', 'Delta', 'Eco'])

    const rows = await plantel(equipo01)

    expect(rows.map((r) => [r.role, r.name])).toEqual([
      ['TOP', 'Alfa'],
      ['JUNGLE', 'Bravo'],
      ['MIDDLE', 'Charlie'],
      ['BOTTOM', 'Delta'],
      ['SUPPORT', 'Eco'],
    ])
    expect(rows.every((r) => r.games === 1)).toBe(true)
  })

  it('el que rota de línea queda en la que más jugó', async () => {
    // La primera Alfa la juega de top y Charlie de mid; las otras dos, al revés.
    await jugarFecha(1, ['Alfa', 'Bravo', 'Charlie', 'Delta', 'Eco'])
    await jugarFecha(2, ['Charlie', 'Bravo', 'Alfa', 'Delta', 'Eco'])
    await jugarFecha(3, ['Charlie', 'Bravo', 'Alfa', 'Delta', 'Eco'])

    const rows = await plantel(equipo01)
    const porRol = new Map(rows.map((r) => [r.role, r.name]))

    expect(porRol.get('MIDDLE')).toBe('Alfa')
    expect(porRol.get('TOP')).toBe('Charlie')
    // Los dos son titulares: nadie termina en el banco por haber rotado.
    expect(rows).toHaveLength(5)
  })

  it('un anotado de más deja un lugar de suplente esperando, y el sexto que juega lo ocupa', async () => {
    await anotar('Uno', 'Dos', 'Tres', 'Cuatro', 'Cinco', 'Seis')

    const vacio = await plantel(equipo01)
    expect(vacio).toHaveLength(6)
    expect(vacio[5]).toMatchObject({ slot: 6, role: null, sub_number: 1, is_substitute: true })
    expect(vacio[5].player_id).toBeNull()

    await jugarFecha(1, ['Alfa', 'Bravo', 'Charlie', 'Delta', 'Eco'])
    await jugarFecha(2, ['Alfa', 'Bravo', 'Charlie', 'Delta', 'Eco'])
    // La tercera la juega Foxtrot de soporte. El titular del rol sigue siendo
    // Eco, que lo jugó dos veces; Foxtrot ocupa el lugar del banco.
    await jugarFecha(3, ['Alfa', 'Bravo', 'Charlie', 'Delta', 'Foxtrot'])

    const rows = await plantel(equipo01)
    expect(rows.map((r) => r.name)).toEqual(['Alfa', 'Bravo', 'Charlie', 'Delta', 'Eco', 'Foxtrot'])
    expect(rows[5]).toMatchObject({ role: null, sub_number: 1, is_substitute: true, games: 1 })
  })

  it('si aparecen más cuentas que anotados, el banco crece igual', async () => {
    // Nadie en la planilla: los lugares del banco los mandan las cuentas.
    await jugarFecha(1, ['Alfa', 'Bravo', 'Charlie', 'Delta', 'Eco'])
    await jugarFecha(2, ['Alfa', 'Bravo', 'Charlie', 'Delta', 'Eco'])
    await jugarFecha(3, ['Alfa', 'Bravo', 'Charlie', 'Delta', 'Foxtrot'])

    const rows = await plantel(equipo01)
    expect(rows).toHaveLength(6)
    expect(rows[5].name).toBe('Foxtrot')
  })

  it('los inscriptos no salen: de la planilla sale un número y nada más', async () => {
    await anotar('Nombre Legal De Una Persona', 'Otro Nombre Legal')

    const { rows } = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'team_lineup'`,
    )

    expect(rows.map((r) => r.column_name).sort()).toEqual([
      // `game_name` y `tag_line` son la cuenta de Riot, que es pública desde
      // siempre (`player_profiles`). El nombre de la planilla no está.
      'game_name',
      'games',
      'is_substitute',
      'name',
      'player_id',
      'role',
      'slot',
      'sub_number',
      'tag_line',
      'team_id',
    ])

    const plantelDe01 = await plantel(equipo01)
    expect(plantelDe01.map((r) => r.name)).not.toContain('Nombre Legal De Una Persona')
  })
})

describe('el soporte se llama SUPPORT', () => {
  let db: PGlite

  beforeEach(async () => {
    db = await createTestDb()
  }, 60_000)

  afterEach(async () => {
    await db?.close()
  })

  it('UTILITY se normaliza al escribir, venga de donde venga', async () => {
    const matchId = await playScoreboard(db, {
      winner: 'blue',
      blue: [{ puuid: 'sup', position: 'UTILITY' }],
      red: [{ puuid: 'otro', position: 'utility' }],
    })

    const { rows } = await db.query<{ position: string }>(
      'select position from public.match_players where match_id = $1',
      [matchId],
    )
    expect(rows.map((r) => r.position)).toEqual(['SUPPORT', 'SUPPORT'])

    // Y tampoco entra por un update a mano.
    await db.query(`update public.match_players set position = 'UTILITY' where match_id = $1`, [
      matchId,
    ])
    const despues = await db.query<{ position: string }>(
      'select distinct position from public.match_players where match_id = $1',
      [matchId],
    )
    expect(despues.rows).toEqual([{ position: 'SUPPORT' }])
  })
})
