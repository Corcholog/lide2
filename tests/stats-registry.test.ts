import { describe, expect, it } from 'vitest'
import { buildStats, STATS } from '@/lib/stats/registry'
import { minGamesForAverages } from '@/lib/stats/rank'
import { bestFive, bestKda, mvp } from '@/lib/stats/players'
import { mostBanned, mostPicked } from '@/lib/stats/champions'
import { universityStandings } from '@/lib/stats/universities'
import type { StatsData, StatScope } from '@/lib/stats/types'
import type { ChampionStatRow, PlayerPhaseTotalsRow, UniversityTotalsRow } from '@/types/db'

/**
 * La capa de presentacion, sin base.
 *
 * Las vistas de SQL se prueban contra Postgres en tests/stats.test.ts; lo que se
 * verifica aca es lo otro: que los rankings elijan bien, que los que no
 * califican queden afuera y que una estadistica sin datos desaparezca en vez de
 * dibujar una tarjeta vacia.
 */

const SCOPE: StatScope = { tournamentId: 't1', phase: 'grupos', matchday: null }

function player(over: Partial<PlayerPhaseTotalsRow>): PlayerPhaseTotalsRow {
  return {
    tournament_id: 't1',
    phase: 'grupos',
    matchday: null,
    round_label: null,
    is_total: true,
    player_id: over.player_name ?? 'p',
    player_name: 'Jugador',
    team_id: 'e1',
    team_name: 'Equipo 01',
    team_tag: null,
    university_id: 'u1',
    university_tag: 'UNLP',
    position: 'MIDDLE',
    games: 4,
    wins: 2,
    losses: 2,
    kills: 10,
    deaths: 5,
    assists: 10,
    kda: 4,
    avg_kills: 2.5,
    avg_deaths: 1.25,
    avg_assists: 2.5,
    kill_participation: 0.5,
    damage_share: 0.25,
    damage: 100_000,
    avg_damage: 25_000,
    dpm: 800,
    damage_taken: 100_000,
    damage_mitigated: 50_000,
    gold: 60_000,
    gpm: 400,
    cs: 800,
    csm: 7,
    vision_score: 100,
    avg_vision: 25,
    wards_placed: 40,
    wards_killed: 10,
    best_killing_spree: 3,
    best_multi_kill: 2,
    double_kills: 1,
    triple_kills: 0,
    quadra_kills: 0,
    penta_kills: 0,
    time_ccing_others: 100,
    time_dead: 200,
    avg_score: 10,
    mvp_count: 0,
    ...over,
  }
}

function champion(over: Partial<ChampionStatRow>): ChampionStatRow {
  return {
    tournament_id: 't1',
    phase: 'grupos',
    matchday: null,
    round_label: null,
    is_total: true,
    champion: 'Ahri',
    position: 'MIDDLE',
    picks: 5,
    wins: 3,
    losses: 2,
    win_pct: 0.6,
    kills: 20,
    deaths: 10,
    assists: 15,
    kda: 3.5,
    avg_damage: 20_000,
    avg_score: 10,
    bans: 0,
    matches: 10,
    matches_with_bans: 0,
    presence: null,
    ...over,
  }
}

function university(over: Partial<UniversityTotalsRow>): UniversityTotalsRow {
  return {
    tournament_id: 't1',
    phase: 'grupos',
    matchday: null,
    round_label: null,
    is_total: true,
    university_id: 'u1',
    university_tag: 'UNLP',
    university_name: 'Universidad Nacional de La Plata',
    university_logo: null,
    matches: 4,
    teams: 1,
    players: 5,
    appearances: 20,
    wins: 10,
    losses: 10,
    win_pct: 0.5,
    kills: 50,
    deaths: 50,
    assists: 60,
    kda: 2.2,
    damage: 500_000,
    gold: 400_000,
    vision_score: 400,
    penta_kills: 0,
    avg_score: 10,
    ...over,
  }
}

function data(over: Partial<StatsData> = {}): StatsData {
  return {
    scope: SCOPE,
    players: [],
    teams: [],
    universities: [],
    champions: [],
    records: [],
    mvp: [],
    ...over,
  }
}

describe('presentacion de estadisticas', () => {
  it('una estadistica sin datos no devuelve un bloque vacio', () => {
    expect(mvp(data())).toBeNull()
    expect(bestKda(data())).toBeNull()
    expect(mostPicked(data())).toBeNull()
  })

  it('las secciones que quedan vacias no llegan a la pagina', () => {
    expect(buildStats(data())).toEqual([])
  })

  it('el catalogo no repite ids', () => {
    expect(new Set(STATS.map((stat) => stat.id)).size).toBe(STATS.length)
  })

  it('el minimo de partidas es mas exigente en el acumulado que en una fecha', () => {
    expect(minGamesForAverages({ ...SCOPE, matchday: null })).toBe(3)
    expect(minGamesForAverages({ ...SCOPE, matchday: 1 })).toBe(1)
  })

  it('el ranking de promedios deja afuera al que jugo una sola', () => {
    const block = bestKda(
      data({
        players: [
          player({ player_name: 'Fugaz', games: 1, kda: 20 }),
          player({ player_name: 'Regular', games: 4, kda: 5 }),
        ],
      }),
    )

    expect(block!.rows.map((row) => row.name)).toEqual(['Regular'])
  })

  it('el quinteto toma al mejor de cada rol y no cinco del mismo', () => {
    const block = bestFive(
      data({
        players: [
          player({ player_name: 'Top A', position: 'TOP', avg_score: 12 }),
          player({ player_name: 'Top B', position: 'TOP', avg_score: 9 }),
          player({ player_name: 'Sup', position: 'SUPPORT', avg_score: 8 }),
        ],
      }),
    )

    expect(block!.rows.map((row) => row.name)).toEqual(['Top A', 'Sup'])
    expect(block!.rows.map((row) => row.display)).toEqual(['Top', 'Soporte'])
  })

  it('un campeon que solo se baneo no entra en los mas elegidos, pero si en los mas baneados', () => {
    const rows = [
      champion({ champion: 'Ahri', picks: 5, bans: 0, matches_with_bans: 4 }),
      champion({ champion: 'Yasuo', picks: 0, bans: 4, matches_with_bans: 4, presence: 1 }),
    ]

    expect(mostPicked(data({ champions: rows }))!.rows.map((r) => r.name)).toEqual(['Ahri'])
    expect(mostBanned(data({ champions: rows }))!.rows.map((r) => r.name)).toEqual(['Yasuo'])
  })

  it('sin ninguna partida con draft cargado, los bloques de bans no existen', () => {
    const rows = [champion({ bans: 0, matches_with_bans: 0 })]
    expect(mostBanned(data({ champions: rows }))).toBeNull()
  })

  it('el ranking de universidades pide un minimo de apariciones', () => {
    const block = universityStandings(
      data({
        universities: [
          university({ university_id: 'u1', university_tag: 'UNCuyo', appearances: 4, win_pct: 1 }),
          university({ university_id: 'u2', university_tag: 'UNLP', appearances: 40, win_pct: 0.6 }),
        ],
      }),
    )

    // Minimo 15 apariciones en el acumulado (3 partidas x 5 jugadores): la que
    // gano su unico partido con un jugador suelto no encabeza la tabla.
    expect(block!.rows.map((row) => row.name)).toEqual(['UNLP'])
  })
})
