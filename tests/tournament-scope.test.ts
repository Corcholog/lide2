import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb } from './helpers/db'
import { playScoreboard } from './helpers/matches'

/**
 * The tournament scope added in 0032: the rows with `all_phases`, which hold
 * both phases together.
 *
 * The setup is built so the answer cannot be reached by adding the two phase
 * rows up. One player plays three group games at a KDA of 1 and one playoff
 * game at 9: averaging the phase averages gives 5.00, averaging the games gives
 * 3.00. Only the second is right, and only the database can compute it.
 */

const BLUE = ['b-top', 'b-jgl', 'b-mid', 'b-adc', 'b-sup']
const RED = ['r-top', 'r-jgl', 'r-mid', 'r-adc', 'r-sup']

/** A scoreboard line at a chosen KDA: (kills + assists) / max(deaths, 1). */
function at(puuid: string, kda: number) {
  return { puuid, position: 'MIDDLE', kills: kda, deaths: 1, assists: 0, damage: 10_000 }
}

/** The other four of a side, so the team has five players. */
function rest(puuids: string[]) {
  return puuids.map((puuid) => ({
    puuid,
    position: 'TOP',
    kills: 1,
    deaths: 1,
    assists: 1,
    damage: 10_000,
  }))
}

interface Totals {
  games: number
  kills: number
  avg_kda: number
  phase: string | null
  is_total: boolean
  all_phases: boolean
}

describe('the tournament scope', () => {
  let db: PGlite
  let tournamentId: string
  const team = new Map<string, string>()

  beforeAll(async () => {
    db = await createTestDb()

    const tournament = await db.query<{ id: string }>(
      `insert into public.tournaments (name, slug, format)
       values ('LIDE 2', 'lide-2', 'grupos') returning id`,
    )
    tournamentId = tournament.rows[0].id

    const playoffStage = await db.query<{ id: string }>(
      `insert into public.stages (tournament_id, name, kind, order_index)
       values ($1, 'Cuartos de final', 'playoffs', 1) returning id`,
      [tournamentId],
    )

    for (const name of ['Equipo 01', 'Equipo 15']) {
      const { rows } = await db.query<{ id: string }>(
        `insert into public.teams (tournament_id, name, group_label)
         values ($1, $2, 'Grupo A') returning id`,
        [tournamentId, name],
      )
      team.set(name, rows[0].id)
    }

    const series = await db.query<{ id: string }>(
      `insert into public.series (stage_id, round, team_a_id, team_b_id, best_of)
       values ($1, 'Cuartos de final', $2, $3, 3) returning id`,
      [playoffStage.rows[0].id, team.get('Equipo 01'), team.get('Equipo 15')],
    )

    // Three group games: b-mid at a KDA of 1 in each.
    for (const matchday of [1, 2, 3]) {
      await playScoreboard(db, {
        tournamentId,
        blueTeamId: team.get('Equipo 01'),
        redTeamId: team.get('Equipo 15'),
        winner: 'blue',
        stageLabel: 'Grupo A',
        roundLabel: `Fecha ${matchday}`,
        blue: [at(BLUE[2], 1), ...rest([BLUE[0], BLUE[1], BLUE[3], BLUE[4]])],
        red: rest(RED),
      })
    }

    // One playoff game, linked to the series: b-mid at a KDA of 9.
    await playScoreboard(db, {
      tournamentId,
      seriesId: series.rows[0].id,
      blueTeamId: team.get('Equipo 01'),
      redTeamId: team.get('Equipo 15'),
      winner: 'blue',
      blue: [at(BLUE[2], 9), ...rest([BLUE[0], BLUE[1], BLUE[3], BLUE[4]])],
      red: rest(RED),
    })

    /*
      An uploaded .rofl that nobody has assigned yet: it carries the tournament
      but no fixture, series or labels, so `match_context` leaves its phase
      NULL. It must not reach any scope.
    */
    await playScoreboard(db, {
      tournamentId,
      blueTeamId: team.get('Equipo 01'),
      redTeamId: team.get('Equipo 15'),
      winner: 'blue',
      blue: [at(BLUE[2], 99), ...rest([BLUE[0], BLUE[1], BLUE[3], BLUE[4]])],
      red: rest(RED),
    })
  })

  afterAll(async () => db?.close())

  /** The totals of one player in a scope. */
  async function totals(where: string): Promise<Totals | undefined> {
    const { rows } = await db.query<Totals>(
      `select games, kills, avg_kda, phase, is_total, all_phases
         from public.player_phase_totals
        where tournament_id = $1 and player_name = $2 and ${where}`,
      [tournamentId, BLUE[2]],
    )
    expect(rows.length).toBeLessThanOrEqual(1)
    return rows[0]
  }

  it('adds a row for the whole tournament', async () => {
    const row = await totals('all_phases')
    expect(row?.phase).toBeNull()
    expect(row?.games).toBe(4)
  })

  it('leaves the phase rows as they were', async () => {
    expect((await totals(`phase = 'grupos' and is_total and not all_phases`))?.games).toBe(3)
    expect((await totals(`phase = 'playoffs' and is_total and not all_phases`))?.games).toBe(1)
  })

  it('adds up to the two phases, so nothing is counted twice or lost', async () => {
    const all = await totals('all_phases')
    const groups = await totals(`phase = 'grupos' and is_total and not all_phases`)
    const playoffs = await totals(`phase = 'playoffs' and is_total and not all_phases`)

    expect(all?.games).toBe(Number(groups?.games) + Number(playoffs?.games))
    expect(Number(all?.kills)).toBe(Number(groups?.kills) + Number(playoffs?.kills))
  })

  /* The whole reason this is a grouping set and not a sum in the application. */
  it('averages the games, not the phase averages', async () => {
    const all = await totals('all_phases')
    const groups = await totals(`phase = 'grupos' and is_total and not all_phases`)
    const playoffs = await totals(`phase = 'playoffs' and is_total and not all_phases`)

    expect(Number(groups?.avg_kda)).toBe(1)
    expect(Number(playoffs?.avg_kda)).toBe(9)

    // (1 + 1 + 1 + 9) / 4, not (1 + 9) / 2.
    expect(Number(all?.avg_kda)).toBe(3)
    expect(Number(all?.avg_kda)).not.toBe(5)
  })

  it('leaves a match that was never assigned out of every scope', async () => {
    const { rows } = await db.query<{ games: number }>(
      `select sum(games)::int as games
         from public.player_phase_totals
        where tournament_id = $1 and player_name = $2 and all_phases`,
      [tournamentId, BLUE[2]],
    )

    // Five matches were played; the unassigned one is not one of the four.
    expect(rows[0].games).toBe(4)

    const orphans = await db.query(
      `select 1 from public.player_phase_totals
        where tournament_id = $1 and phase is null and not all_phases`,
      [tournamentId],
    )
    expect(orphans.rows).toHaveLength(0)
  })

  it('ranks the tournament MVP among the tournament rows', async () => {
    const { rows } = await db.query<{ player_name: string; games: number }>(
      `select player_name, games from public.tournament_mvp
        where tournament_id = $1 and all_phases and mvp_rank = 1`,
      [tournamentId],
    )

    expect(rows).toHaveLength(1)
    expect(rows[0].player_name).toBe(BLUE[2])
  })

  /*
   * Two games over the tournament, one inside a phase. The red support plays
   * the group games only through `rest`, so everyone has enough; this pins the
   * threshold itself rather than a player.
   */
  it('asks for two games over the tournament and one inside a phase', async () => {
    const { rows } = await db.query<{ tournament: number; phase: number }>(
      `select public.mvp_min_games(true, true)  as tournament,
              public.mvp_min_games(true, false) as phase`,
    )

    expect(rows[0].tournament).toBe(2)
    expect(rows[0].phase).toBe(1)
  })

  it('keeps one champion_meta row per scope, with no collision', async () => {
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n
         from public.champion_meta
        where tournament_id = $1 and all_phases and all_groups and all_matchdays
          and all_roles and champion is not null`,
      [tournamentId],
    )

    // One row per champion played, not one per champion per phase.
    const champions = await db.query<{ n: number }>(
      `select count(distinct champion)::int as n
         from public.player_match_stats
        where tournament_id = $1 and phase is not null`,
      [tournamentId],
    )

    expect(rows[0].n).toBe(champions.rows[0].n)
  })

  /*
   * A playoff series belongs to no group, so a tournament row split by group
   * would just be the group phase again under another name.
   */
  it('never splits the tournament scope by group', async () => {
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from public.champion_meta
        where tournament_id = $1 and all_phases and not all_groups`,
      [tournamentId],
    )

    expect(rows[0].n).toBe(0)
  })
})
