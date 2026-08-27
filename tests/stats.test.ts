import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb } from './helpers/db'
import { playScoreboard } from './helpers/matches'

/**
 * El motor de estadisticas, sobre Postgres embebido.
 *
 * Se arman dos equipos de un grupo y dos fechas de partidos a mano. Un
 * scoreboard inventado es mas riguroso que datos reales para esto: se puede
 * poner exactamente el caso que se quiere verificar (el soporte que no mata a
 * nadie, el top que no muere pero no participa, el equipo con tres
 * universidades) en vez de esperar a que aparezca.
 *
 * El Equipo 15 es el caso dificil de la LIDE 2 de verdad: salio de
 * inscripciones individuales y mezcla UNER, UADE y UNLP.
 */

const BLUE = ['b-top', 'b-jgl', 'b-mid', 'b-adc', 'b-sup']
const RED = ['r-top', 'r-jgl', 'r-mid', 'r-adc', 'r-sup']

interface PlayerRow {
  player_name: string
  position: string | null
  games: number
  kills: number
  deaths: number
  assists: number
  kda: number
  avg_score: number
  matchday: number | null
  is_total: boolean
  university_tag: string | null
}

describe('estadisticas', () => {
  let db: PGlite
  let tournamentId: string
  let stageId: string
  const team = new Map<string, string>()
  const university = new Map<string, string>()

  beforeAll(async () => {
    db = await createTestDb()

    const tournament = await db.query<{ id: string }>(
      `insert into public.tournaments (name, slug, format)
       values ('LIDE 2', 'lide-2', 'grupos') returning id`,
    )
    tournamentId = tournament.rows[0].id

    const stage = await db.query<{ id: string }>(
      `insert into public.stages (tournament_id, name, kind, order_index)
       values ($1, 'Grupo A', 'grupos', 0) returning id`,
      [tournamentId],
    )
    stageId = stage.rows[0].id

    for (const [tag, name] of [
      ['UNLP', 'Universidad Nacional de La Plata'],
      ['UNER', 'Universidad Nacional de Entre Rios'],
      ['UADE', 'Universidad Argentina de la Empresa'],
    ]) {
      const { rows } = await db.query<{ id: string }>(
        `insert into public.universities (name, tag) values ($1, $2) returning id`,
        [name, tag],
      )
      university.set(tag, rows[0].id)
    }

    // Equipo 01: todos de UNLP. Equipo 15: mezclado, principal UNER.
    for (const [name, tag] of [
      ['Equipo 01', 'UNLP'],
      ['Equipo 15', 'UNER'],
    ]) {
      const { rows } = await db.query<{ id: string }>(
        `insert into public.teams (tournament_id, name, group_label, university_id)
         values ($1, $2, 'Grupo A', $3) returning id`,
        [tournamentId, name, university.get(tag)],
      )
      team.set(name, rows[0].id)
    }

    for (const [index, tag] of ['UNER', 'UADE', 'UNLP'].entries()) {
      await db.query(
        `insert into public.team_universities (team_id, university_id, order_index)
         values ($1, $2, $3)`,
        [team.get('Equipo 15'), university.get(tag), index],
      )
    }
  }, 60_000)

  afterAll(async () => {
    await db?.close()
  })

  describe('el MVP premia el aporte y no el no jugarse nada', () => {
    let matchId: string

    beforeAll(async () => {
      // 20 kills del lado ganador. El soporte no mata a nadie pero estuvo en
      // 16 de las 20; el top gana su linea, no muere nunca y participa en 4.
      matchId = await playScoreboard(db, {
        tournamentId,
        blueTeamId: team.get('Equipo 01'),
        redTeamId: team.get('Equipo 15'),
        winner: 'blue',
        stageLabel: 'Grupo A',
        roundLabel: 'Fecha 1',
        blue: [
          { puuid: BLUE[0], position: 'TOP', kills: 4, deaths: 0, assists: 0, damage: 18_000 },
          { puuid: BLUE[1], position: 'JUNGLE', kills: 5, deaths: 2, assists: 8, damage: 20_000 },
          { puuid: BLUE[2], position: 'MIDDLE', kills: 8, deaths: 2, assists: 6, damage: 34_000 },
          { puuid: BLUE[3], position: 'BOTTOM', kills: 3, deaths: 3, assists: 5, damage: 22_000 },
          { puuid: BLUE[4], position: 'SUPPORT', kills: 0, deaths: 2, assists: 16, damage: 6_000 },
        ],
        red: [
          { puuid: RED[0], position: 'TOP', kills: 1, deaths: 3, assists: 1, damage: 12_000 },
          { puuid: RED[1], position: 'JUNGLE', kills: 1, deaths: 4, assists: 2, damage: 11_000 },
          { puuid: RED[2], position: 'MIDDLE', kills: 2, deaths: 3, assists: 1, damage: 16_000 },
          { puuid: RED[3], position: 'BOTTOM', kills: 1, deaths: 4, assists: 2, damage: 14_000 },
          { puuid: RED[4], position: 'SUPPORT', kills: 0, deaths: 6, assists: 3, damage: 4_000 },
        ],
      })
    })

    it('el soporte con 0 kills le gana al top que no murio', async () => {
      const { rows } = await db.query<{ riot_game_name: string; position: string }>(
        `select riot_game_name, position from public.match_player_scores
          where match_id = $1 and match_rank = 1`,
        [matchId],
      )

      expect(rows[0].position).toBe('SUPPORT')
      expect(rows[0].riot_game_name).toBe('b-sup')
    })

    it('el top con 4/0/0 queda por debajo del mid que participo del doble', async () => {
      const { rows } = await db.query<{ riot_game_name: string; match_rank: number }>(
        `select riot_game_name, match_rank from public.match_player_scores
          where match_id = $1 order by match_rank`,
        [matchId],
      )

      const rank = new Map(rows.map((row) => [row.riot_game_name, row.match_rank]))
      expect(rank.get('b-mid')!).toBeLessThan(rank.get('b-top')!)
    })

    it('no hay dos jugadores con el mismo puesto', async () => {
      const { rows } = await db.query<{ n: string }>(
        `select count(distinct match_rank) as n from public.match_player_scores where match_id = $1`,
        [matchId],
      )
      expect(Number(rows[0].n)).toBe(10)
    })
  })

  describe('el contexto sale del fixture y no del nombre del archivo', () => {
    let matchId: string

    beforeAll(async () => {
      // Etiquetas equivocadas a proposito: asi queda un .rofl guardado en la
      // carpeta que no era.
      matchId = await playScoreboard(db, {
        tournamentId,
        blueTeamId: team.get('Equipo 15'),
        redTeamId: team.get('Equipo 01'),
        winner: 'blue',
        stageLabel: 'Grupo D',
        roundLabel: 'Fecha 3',
        playedAt: '2026-09-12T17:00:00Z',
        blue: RED.map((puuid, i) => ({ puuid, kills: i, deaths: 1, assists: 2 })),
        red: BLUE.map((puuid, i) => ({ puuid, kills: 0, deaths: i + 1, assists: 1 })),
      })

      await db.query(
        `insert into public.fixtures
           (tournament_id, stage_id, group_label, matchday, slot, kickoff, team_a_id, team_b_id, match_id)
         values ($1, $2, 'Grupo A', 2, 1, '2026-09-12T17:00:00Z', $3, $4, $5)`,
        [tournamentId, stageId, team.get('Equipo 15'), team.get('Equipo 01'), matchId],
      )
    })

    it('el cruce publicado le gana a la etiqueta del archivo', async () => {
      const { rows } = await db.query<{
        phase: string
        group_label: string
        matchday: number
        slot: number
        round_label: string
      }>(`select phase, group_label, matchday, slot, round_label from public.match_context
           where match_id = $1`, [matchId])

      expect(rows[0]).toMatchObject({
        phase: 'grupos',
        group_label: 'Grupo A',
        matchday: 2,
        slot: 1,
        round_label: 'Fecha 2',
      })
    })

    it('sin fixture, la fecha sale de la etiqueta', async () => {
      const { rows } = await db.query<{ matchday: number; group_label: string }>(
        `select matchday, group_label from public.match_context c
           join public.matches m on m.id = c.match_id
          where m.round_label = 'Fecha 1' and m.stage_label = 'Grupo A'`,
      )

      expect(rows[0]).toMatchObject({ matchday: 1, group_label: 'Grupo A' })
    })

    it('la tabla de grupos cuenta la partida aunque el archivo dijera otro grupo', async () => {
      const { rows } = await db.query<{ team_name: string; games: number; wins: number }>(
        `select team_name, games, wins from public.group_standings
          where tournament_id = $1 order by team_name`,
        [tournamentId],
      )

      // Dos partidos, uno ganado por cada equipo, los dos en el Grupo A.
      expect(rows.map((r) => [r.team_name, Number(r.games), Number(r.wins)])).toEqual([
        ['Equipo 01', 2, 1],
        ['Equipo 15', 2, 1],
      ])
    })
  })

  describe('acumulados por fecha y de toda la fase', () => {
    it('la fila de la fecha y la del acumulado son distintas y no se pisan', async () => {
      const { rows } = await db.query<PlayerRow>(
        `select player_name, games, kills, matchday, is_total
           from public.player_phase_totals
          where tournament_id = $1 and player_name = 'b-mid'
          order by is_total, matchday`,
        [tournamentId],
      )

      const fecha1 = rows.find((r) => !r.is_total && Number(r.matchday) === 1)!
      const fecha2 = rows.find((r) => !r.is_total && Number(r.matchday) === 2)!
      const total = rows.find((r) => r.is_total)!

      expect(Number(fecha1.kills)).toBe(8)
      expect(Number(fecha2.kills)).toBe(0)
      expect(Number(total.games)).toBe(2)
      expect(Number(total.kills)).toBe(8)
      expect(total.matchday).toBeNull()
    })

    it('el equipo suma sus dos partidos en el acumulado', async () => {
      const { rows } = await db.query<{ games: number; wins: number; losses: number }>(
        `select games, wins, losses from public.team_phase_totals
          where tournament_id = $1 and is_total and team_id = $2`,
        [tournamentId, team.get('Equipo 01')],
      )

      expect(Number(rows[0].games)).toBe(2)
      expect(Number(rows[0].wins)).toBe(1)
      expect(Number(rows[0].losses)).toBe(1)
    })

    it('el MVP de la fase pide mas partidas que el de una fecha', async () => {
      const fecha = await db.query<{ n: string }>(
        `select count(*) as n from public.tournament_mvp
          where tournament_id = $1 and not is_total and matchday = 1`,
        [tournamentId],
      )
      const fase = await db.query<{ n: string }>(
        `select count(*) as n from public.tournament_mvp where tournament_id = $1 and is_total`,
        [tournamentId],
      )

      // Con dos partidos jugados nadie llega al minimo de la fase entera (3),
      // pero en una fecha alcanza con haber jugado.
      expect(Number(fecha.rows[0].n)).toBe(10)
      expect(Number(fase.rows[0].n)).toBe(0)
    })
  })

  describe('universidades', () => {
    it('sin emparejar inscriptos, todo el equipo va a su universidad principal', async () => {
      const { rows } = await db.query<{ university_tag: string; players: string }>(
        `select university_tag, players from public.university_totals
          where tournament_id = $1 and is_total order by university_tag`,
        [tournamentId],
      )

      // Equipo 01 -> UNLP, Equipo 15 -> UNER (la principal), nadie en UADE.
      expect(rows.map((r) => r.university_tag)).toEqual(['UNER', 'UNLP'])
      expect(rows.map((r) => Number(r.players))).toEqual([5, 5])
    })

    it('al emparejar a un jugador, sus numeros se mudan a la universidad que declaro', async () => {
      const player = await db.query<{ id: string }>(
        `select id from public.players where puuid = $1`,
        [RED[0]],
      )

      await db.query(
        `insert into public.team_roster (team_id, full_name, university_id, order_index, player_id)
         values ($1, 'Una Persona', $2, 0, $3)`,
        [team.get('Equipo 15'), university.get('UADE'), player.rows[0].id],
      )

      const { rows } = await db.query<{ university_tag: string; players: string }>(
        `select university_tag, players from public.university_totals
          where tournament_id = $1 and is_total order by university_tag`,
        [tournamentId],
      )

      const byTag = new Map(rows.map((r) => [r.university_tag, Number(r.players)]))
      expect(byTag.get('UADE')).toBe(1)
      expect(byTag.get('UNER')).toBe(4)
      expect(byTag.get('UNLP')).toBe(5)
    })
  })

  describe('meta y records', () => {
    it('sin bans cargados no hay presencia', async () => {
      const { rows } = await db.query<{ presence: number | null; matches_with_bans: number }>(
        `select presence, matches_with_bans from public.champion_stats
          where tournament_id = $1 and is_total limit 1`,
        [tournamentId],
      )

      expect(rows[0].presence).toBeNull()
      expect(Number(rows[0].matches_with_bans)).toBe(0)
    })

    it('los bans cargados a mano solo miden las partidas que los tienen', async () => {
      const match = await db.query<{ match_id: string }>(
        `select match_id from public.match_context where tournament_id = $1 and matchday = 1`,
        [tournamentId],
      )

      for (const [index, champion] of ['Yasuo', 'Nautilus'].entries()) {
        await db.query(
          `insert into public.match_bans (match_id, side, champion, order_index)
           values ($1, 100, $2, $3)`,
          [match.rows[0].match_id, champion, index],
        )
      }

      const { rows } = await db.query<{
        champion: string
        bans: number
        matches: number
        matches_with_bans: number
        presence: number
      }>(
        `select champion, bans, matches, matches_with_bans, presence
           from public.champion_stats
          where tournament_id = $1 and is_total and champion = 'Yasuo'`,
        [tournamentId],
      )

      // Una de las dos partidas tiene draft cargado: el ban vale sobre esa.
      expect(Number(rows[0].bans)).toBe(1)
      expect(Number(rows[0].matches)).toBe(2)
      expect(Number(rows[0].matches_with_bans)).toBe(1)
      expect(Number(rows[0].presence)).toBe(1)
    })

    it('los records salen del recorte que se pida', async () => {
      const { rows } = await db.query<{
        matchday: number
        total_kills: number
        kill_gap: number
      }>(
        `select matchday, total_kills, kill_gap from public.match_records
          where tournament_id = $1 order by matchday`,
        [tournamentId],
      )

      expect(rows.map((r) => Number(r.matchday))).toEqual([1, 2])
      // Fecha 1: 20 del ganador y 5 del perdedor.
      expect(Number(rows[0].total_kills)).toBe(25)
      expect(Number(rows[0].kill_gap)).toBe(15)
    })
  })
})
