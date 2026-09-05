import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb } from './helpers/db'
import { playScoreboard } from './helpers/matches'

/**
 * The stats engine, over embedded Postgres.
 *
 * Two teams from one group and two matchdays' worth of games are built by hand.
 * An invented scoreboard is stricter than real data for this: the exact case to
 * be verified can be set up (the support who kills nobody, the top who never
 * dies but never participates, the team with three universities) instead of
 * waiting for it to turn up.
 *
 * Team 15 is the hard case from the real LIDE 2: it came out of individual
 * signups and mixes UNER, UADE and UNLP.
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

describe('stats', () => {
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

    // Team 01: all from UNLP. Team 15: mixed, main one UNER.
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

  describe('the MVP rewards contribution and not playing it safe', () => {
    let matchId: string

    beforeAll(async () => {
      // 20 kills for the winning side. The support kills nobody but was in on
      // 16 of the 20; the top wins their lane, never dies and joins 4.
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

    it('the support on 0 kills beats the top who never died', async () => {
      const { rows } = await db.query<{ riot_game_name: string; position: string }>(
        `select riot_game_name, position from public.match_player_scores
          where match_id = $1 and match_rank = 1`,
        [matchId],
      )

      expect(rows[0].position).toBe('SUPPORT')
      expect(rows[0].riot_game_name).toBe('b-sup')
    })

    it('the top on 4/0/0 lands below the mid who joined twice as much', async () => {
      const { rows } = await db.query<{ riot_game_name: string; match_rank: number }>(
        `select riot_game_name, match_rank from public.match_player_scores
          where match_id = $1 order by match_rank`,
        [matchId],
      )

      const rank = new Map(rows.map((row) => [row.riot_game_name, row.match_rank]))
      expect(rank.get('b-mid')!).toBeLessThan(rank.get('b-top')!)
    })

    it('no two players share the same place', async () => {
      const { rows } = await db.query<{ n: string }>(
        `select count(distinct match_rank) as n from public.match_player_scores where match_id = $1`,
        [matchId],
      )
      expect(Number(rows[0].n)).toBe(10)
    })
  })

  describe('the context comes from the fixture and not the file name', () => {
    let matchId: string

    beforeAll(async () => {
      // Deliberately wrong labels: this is how a .rofl filed in the wrong
      // folder ends up.
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

    it("the published matchup beats the file's label", async () => {
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

    it('with no fixture, the matchday comes from the label', async () => {
      const { rows } = await db.query<{ matchday: number; group_label: string }>(
        `select matchday, group_label from public.match_context c
           join public.matches m on m.id = c.match_id
          where m.round_label = 'Fecha 1' and m.stage_label = 'Grupo A'`,
      )

      expect(rows[0]).toMatchObject({ matchday: 1, group_label: 'Grupo A' })
    })

    it('the group table counts the match even when the file said another group', async () => {
      const { rows } = await db.query<{ team_name: string; games: number; wins: number }>(
        `select team_name, games, wins from public.group_standings
          where tournament_id = $1 order by team_name`,
        [tournamentId],
      )

      // Two games, one won by each team, both in Group A.
      expect(rows.map((r) => [r.team_name, Number(r.games), Number(r.wins)])).toEqual([
        ['Equipo 01', 2, 1],
        ['Equipo 15', 2, 1],
      ])
    })
  })

  describe('totals by matchday and for the whole phase', () => {
    it('the matchday row and the total row are different and do not collide', async () => {
      const { rows } = await db.query<PlayerRow>(
        `select player_name, games, kills, matchday, is_total
           from public.player_phase_totals
          where tournament_id = $1 and player_name = 'b-mid'
          order by is_total, matchday`,
        [tournamentId],
      )

      const matchday1 = rows.find((r) => !r.is_total && Number(r.matchday) === 1)!
      const matchday2 = rows.find((r) => !r.is_total && Number(r.matchday) === 2)!
      const total = rows.find((r) => r.is_total)!

      expect(Number(matchday1.kills)).toBe(8)
      expect(Number(matchday2.kills)).toBe(0)
      expect(Number(total.games)).toBe(2)
      expect(Number(total.kills)).toBe(8)
      expect(total.matchday).toBeNull()
    })

    it('the average KDA is not the total KDA', async () => {
      const { rows } = await db.query<{ kda: number; avg_kda: number }>(
        `select kda, avg_kda from public.player_phase_totals
          where tournament_id = $1 and is_total and player_name = 'b-top'`,
        [tournamentId],
      )

      // b-top played 4/0/0 and then 0/1/1. Over the totals that is
      // (4 + 1) / 1 = 5.00, because the game without deaths leaves nothing in
      // the denominator; game by game it is (4.00 + 1.00) / 2 = 2.50. Same
      // player, same two games, two different numbers: that is exactly why
      // both columns exist and why each card says which one it is showing.
      expect(Number(rows[0].kda)).toBe(5)
      expect(Number(rows[0].avg_kda)).toBe(2.5)
    })

    it('the team adds up its two games in the total', async () => {
      const { rows } = await db.query<{ games: number; wins: number; losses: number }>(
        `select games, wins, losses from public.team_phase_totals
          where tournament_id = $1 and is_total and team_id = $2`,
        [tournamentId, team.get('Equipo 01')],
      )

      expect(Number(rows[0].games)).toBe(2)
      expect(Number(rows[0].wins)).toBe(1)
      expect(Number(rows[0].losses)).toBe(1)
    })

    it('the MVP takes in whoever played, in both cuts', async () => {
      const min = await db.query<{ total: string; fecha: string }>(
        `select public.mvp_min_games(true) as total, public.mvp_min_games(false) as fecha`,
      )

      expect(Number(min.rows[0].total)).toBe(1)
      expect(Number(min.rows[0].fecha)).toBe(1)

      const matchdayRow = await db.query<{ n: string }>(
        `select count(*) as n from public.tournament_mvp
          where tournament_id = $1 and not is_total and matchday = 1`,
        [tournamentId],
      )
      const fase = await db.query<{ n: string }>(
        `select count(*) as n from public.tournament_mvp where tournament_id = $1 and is_total`,
        [tournamentId],
      )

      // The ten played both games, so they are all in both cuts. The number
      // that matters here is the one the threshold used to be: at three the
      // phase MVP was empty with two matchdays played, which is to say the
      // card did not exist until the tournament was nearly over. See
      // 0026_minimo_una_partida.sql.
      expect(Number(matchdayRow.rows[0].n)).toBe(10)
      expect(Number(fase.rows[0].n)).toBe(10)
    })
  })

  describe('universities', () => {
    it('with no signups matched, the whole team goes to its main university', async () => {
      const { rows } = await db.query<{ university_tag: string; players: string }>(
        `select university_tag, players from public.university_totals
          where tournament_id = $1 and is_total order by university_tag`,
        [tournamentId],
      )

      // Team 01 -> UNLP, Team 15 -> UNER (the main one), nobody in UADE.
      expect(rows.map((r) => r.university_tag)).toEqual(['UNER', 'UNLP'])
      expect(rows.map((r) => Number(r.players))).toEqual([5, 5])
    })

    it('matching a player moves their numbers to the university they declared', async () => {
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

  describe('meta and records', () => {
    it('with no bans entered there is no presence', async () => {
      const { rows } = await db.query<{ presence: number | null; matches_with_bans: number }>(
        `select presence, matches_with_bans from public.champion_stats
          where tournament_id = $1 and is_total limit 1`,
        [tournamentId],
      )

      expect(rows[0].presence).toBeNull()
      expect(Number(rows[0].matches_with_bans)).toBe(0)
    })

    it('the hand-entered bans only measure the matches that have them', async () => {
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
