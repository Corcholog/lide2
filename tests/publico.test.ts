import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb } from './helpers/db'
import { playScoreboard } from './helpers/matches'

/**
 * Que se ve sin sesion.
 *
 * Esto es lo unico que verifica de verdad la migracion 0013: la clave publicable
 * viaja al browser, asi que cualquiera puede pegarle directo a PostgREST. Que
 * las paginas no muestren algo no prueba nada; lo que prueba es que la base no
 * lo entregue.
 *
 * Los tests corren como el rol `anon`, igual que un visitante.
 */

async function asAnon<T>(db: PGlite, sql: string, params: unknown[] = []): Promise<T[]> {
  await db.exec('set role anon')
  try {
    const { rows } = await db.query<T>(sql, params)
    return rows
  } finally {
    await db.exec('reset role')
  }
}

async function anonFails(db: PGlite, sql: string): Promise<string> {
  await db.exec('set role anon')
  try {
    await db.query(sql)
    return 'no fallo'
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  } finally {
    await db.exec('reset role')
  }
}

describe('acceso publico', () => {
  let db: PGlite
  let tournamentId: string
  let equipo01: string

  beforeAll(async () => {
    db = await createTestDb()

    const tournament = await db.query<{ id: string }>(
      `insert into public.tournaments (name, slug) values ('LIDE 2', 'lide-2') returning id`,
    )
    tournamentId = tournament.rows[0].id

    const university = await db.query<{ id: string }>(
      `insert into public.universities (name, tag) values ('Universidad Nacional de La Plata', 'UNLP')
       returning id`,
    )

    const teams = await db.query<{ id: string; name: string }>(
      `insert into public.teams (tournament_id, name, group_label, university_id)
       values ($1, 'Equipo 01', 'Grupo A', $2), ($1, 'Equipo 07', 'Grupo A', $2)
       returning id, name`,
      [tournamentId, university.rows[0].id],
    )
    equipo01 = teams.rows.find((row) => row.name === 'Equipo 01')!.id
    const equipo07 = teams.rows.find((row) => row.name === 'Equipo 07')!.id

    await db.query(
      `insert into public.team_roster (team_id, full_name, university_id, order_index)
       values ($1, 'Nombre Legal De Una Persona', $2, 0)`,
      [equipo01, university.rows[0].id],
    )

    const fixture = await db.query<{ id: string }>(
      `insert into public.fixtures
         (tournament_id, group_label, matchday, slot, kickoff, team_a_id, team_b_id)
       values ($1, 'Grupo A', 1, 1, '2026-09-05T17:00:00Z', $2, $3)
       returning id`,
      [tournamentId, equipo01, equipo07],
    )

    const matchId = await playScoreboard(db, {
      winner: 'blue',
      blue: ['a1', 'a2', 'a3', 'a4', 'a5'].map((puuid) => ({
        puuid,
        kills: 3,
        deaths: 1,
        assists: 4,
      })),
      red: ['b1', 'b2', 'b3', 'b4', 'b5'].map((puuid) => ({ puuid, kills: 1, deaths: 3 })),
    })

    await db.query('select public.assign_match_to_fixture($1, $2, $3)', [
      matchId,
      fixture.rows[0].id,
      equipo01,
    ])
  }, 60_000)

  afterAll(async () => {
    await db?.close()
  })

  describe('lo que un visitante SI ve', () => {
    it('el torneo, los equipos y el fixture', async () => {
      expect(await asAnon(db, 'select id from public.tournaments')).toHaveLength(1)
      expect(await asAnon(db, 'select id from public.teams')).toHaveLength(2)
      expect(await asAnon(db, 'select id from public.fixtures')).toHaveLength(1)
      expect(await asAnon(db, 'select id from public.universities')).toHaveLength(1)
    })

    it('la tabla de posiciones y el resultado del cruce', async () => {
      const standings = await asAnon<{ team_name: string; wins: number }>(
        db,
        'select team_name, wins from public.group_standings order by team_name',
      )
      expect(standings.map((r) => [r.team_name, Number(r.wins)])).toEqual([
        ['Equipo 01', 1],
        ['Equipo 07', 0],
      ])

      const fixture = await asAnon<{ status: string }>(
        db,
        'select status from public.fixture_results',
      )
      expect(fixture[0].status).toBe('jugado')
    })

    it('el scoreboard de la partida, con items y hechizos', async () => {
      const rows = await asAnon<{ champion: string; items: number[] }>(
        db,
        'select champion, items from public.match_player_scores',
      )
      expect(rows).toHaveLength(10)
    })

    it('las estadisticas', async () => {
      expect(await asAnon(db, 'select * from public.player_totals')).toHaveLength(10)
      expect(await asAnon(db, 'select * from public.match_summaries')).toHaveLength(1)
      expect(await asAnon(db, 'select * from public.university_totals')).not.toHaveLength(0)
      expect(await asAnon(db, 'select * from public.match_records')).toHaveLength(1)

      // El meta de la pestaña Tablas. Es la unica forma de detectar un
      // `security_invoker` mal puesto: el sintoma seria cero filas sin ningun
      // error, y solo para quien no tiene sesion —o sea, invisible en
      // desarrollo, donde uno siempre esta logueado—.
      expect(await asAnon(db, 'select * from public.champion_meta')).not.toHaveLength(0)
    })

    it('las columnas nuevas de match_summaries', async () => {
      // El recorte y el estado del draft (0021): de aca salen los filtros de
      // /partidas y el badge de "sin draft" del panel.
      const rows = await asAnon<{ matchday: number | null; ban_count: number }>(
        db,
        'select matchday, group_label, ban_count from public.match_summaries',
      )
      expect(rows[0].ban_count).toBe(0)
    })

    it('la ficha de un jugador y el plantel de un equipo', async () => {
      expect(await asAnon(db, 'select * from public.player_profiles')).toHaveLength(10)
      expect(
        await asAnon(db, `select * from public.team_accounts where team_id = '${equipo01}'`),
      ).toHaveLength(5)

      // El plantel es lo que ve un visitante en la ficha del equipo: los cinco
      // lugares con el nick de quien los juega. La vista lee team_roster para
      // contar los anotados, asi que corre como definer; que un `anon` la pueda
      // leer es justamente lo que hay que probar.
      const plantel = await asAnon<{ role: string | null; name: string | null }>(
        db,
        `select role, name from public.team_lineup where team_id = '${equipo01}' order by slot`,
      )
      expect(plantel.map((r) => r.role)).toEqual([
        'TOP',
        'JUNGLE',
        'MIDDLE',
        'BOTTOM',
        'SUPPORT',
      ])
      expect(plantel.every((r) => r.name !== null)).toBe(true)
    })
  })

  describe('lo que un visitante NO ve', () => {
    it('ninguna vista publica devuelve una columna puuid', async () => {
      const rows = await asAnon<{ table_name: string }>(
        db,
        `select table_name from information_schema.columns
          where table_schema = 'public' and column_name = 'puuid'`,
      )

      // Solo las tablas crudas, que no son legibles sin sesion.
      expect(rows.map((r) => r.table_name).sort()).toEqual(['match_players', 'players'])
    })

    it('las tablas con puuid o JSON crudo no devuelven filas', async () => {
      expect(await asAnon(db, 'select id from public.players')).toHaveLength(0)
      expect(await asAnon(db, 'select id from public.match_players')).toHaveLength(0)
      expect(await asAnon(db, 'select id from public.matches')).toHaveLength(0)
    })

    it('los nombres legales de los inscriptos', async () => {
      expect(await asAnon(db, 'select id from public.team_roster')).toHaveLength(0)
      expect(await asAnon(db, 'select * from public.roster_status')).toHaveLength(0)
    })

    it('los archivos del storage ni los errores de ingesta', async () => {
      expect(await asAnon(db, 'select id from public.match_files')).toHaveLength(0)
      expect(await asAnon(db, 'select id from public.ingest_failures')).toHaveLength(0)
    })

    it('la cola del panel', async () => {
      expect(await asAnon(db, 'select * from public.unassigned_matches')).toHaveLength(0)
    })

    it('tampoco puede escribir', async () => {
      expect(
        await anonFails(db, `insert into public.teams (name) values ('Equipo Trucho')`),
      ).toMatch(/permission denied|policy/i)
      expect(await anonFails(db, 'delete from public.fixtures')).toMatch(
        /permission denied|policy/i,
      )
    })
  })

  describe('con sesion se ve lo del panel', () => {
    it('el mismo visitante autenticado si ve los inscriptos', async () => {
      await db.exec('set role authenticated')
      const { rows } = await db.query('select * from public.roster_status')
      await db.exec('reset role')

      expect(rows).toHaveLength(1)
    })
  })
})
