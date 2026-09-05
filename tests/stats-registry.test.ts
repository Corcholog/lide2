import { describe, expect, it } from 'vitest'
import { buildStats, STATS } from '@/lib/stats/registry'
import { minGamesForAverages } from '@/lib/stats/rank'
import { bestAverageKda, bestFive, bestKda, mvp } from '@/lib/stats/players'
import { mostBanned, mostPicked } from '@/lib/stats/champions'
import { goldDiff, killDiff, topObjectives } from '@/lib/stats/teams'
import { universityStandings } from '@/lib/stats/universities'
import type { StatsData, StatScope } from '@/lib/stats/types'
import type {
  ChampionStatRow,
  PlayerPhaseTotalsRow,
  TeamPhaseTotalsRow,
  UniversityTotalsRow,
} from '@/types/db'

/**
 * The presentation layer, with no database.
 *
 * The SQL views are tested against Postgres in tests/stats.test.ts; what gets
 * verified here is the other half: that the rankings pick correctly, that the
 * ones who do not qualify stay out and that a stat with no data disappears
 * instead of drawing an empty card.
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
    avg_kda: 4,
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

function team(over: Partial<TeamPhaseTotalsRow>): TeamPhaseTotalsRow {
  return {
    tournament_id: 't1',
    phase: 'grupos',
    matchday: null,
    round_label: null,
    is_total: true,
    team_id: over.team_name ?? 'e1',
    team_name: 'Equipo 01',
    team_tag: null,
    group_label: 'Grupo A',
    team_logo: null,
    games: 2,
    wins: 1,
    losses: 1,
    win_pct: 0.5,
    kills: 40,
    kills_against: 30,
    kill_diff: 10,
    gold: 120_000,
    gold_diff: 4_000,
    avg_minutes: 30,
    dragons: 4,
    barons: 1,
    heralds: 1,
    turrets: 10,
    objectives: 6,
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

describe('stats presentation', () => {
  it('a stat with no data does not return an empty block', () => {
    expect(mvp(data())).toBeNull()
    expect(bestKda(data())).toBeNull()
    expect(mostPicked(data())).toBeNull()
  })

  it('the sections that end up empty never reach the page', () => {
    expect(buildStats(data())).toEqual([])
  })

  it('the catalogue repeats no ids', () => {
    expect(new Set(STATS.map((stat) => stat.id)).size).toBe(STATS.length)
  })

  it('having played is enough to enter a ranking of averages', () => {
    expect(minGamesForAverages()).toBe(1)
  })

  it('the two KDA rankings can disagree, which is the point of having both', () => {
    const players = [
      // Steady: never a great game, never a bad one.
      player({ player_name: 'Sostenido', games: 4, kda: 6, avg_kda: 6 }),
      // One perfect game and one disaster: over the totals it drags, game by
      // game the deathless one counts whole.
      player({ player_name: 'Picos', games: 4, kda: 4, avg_kda: 9 }),
    ]

    expect(bestKda(data({ players }))!.rows.map((row) => row.name)).toEqual([
      'Sostenido',
      'Picos',
    ])
    expect(bestAverageKda(data({ players }))!.rows.map((row) => row.name)).toEqual([
      'Picos',
      'Sostenido',
    ])
  })

  it('whoever played once is in the averages, which is what makes the cards appear', () => {
    const players = [
      player({ player_name: 'Una sola', games: 1, kda: 20, avg_kda: 20 }),
      player({ player_name: 'Dos', games: 2, kda: 8, avg_kda: 8 }),
      player({ player_name: 'Cuatro', games: 4, kda: 5, avg_kda: 5 }),
    ]

    // At three - the minimum there used to be - nobody in the group phase
    // qualified until the third matchday, so both rankings came out empty and
    // neither card got drawn at all. There are teams that play a single game
    // in the first matchday, so two left their whole five out.
    expect(bestKda(data({ players }))!.rows.map((row) => row.name)).toEqual([
      'Una sola',
      'Dos',
      'Cuatro',
    ])
    expect(bestAverageKda(data({ players }))!.rows.map((row) => row.name)).toEqual([
      'Una sola',
      'Dos',
      'Cuatro',
    ])
  })

  it('the cards do not announce a minimum that leaves nobody out', () => {
    const players = [player({ player_name: 'Uno', games: 1, kda: 8, avg_kda: 8 })]

    expect(bestKda(data({ players }))!.subtitle).toBe('Sobre el total del recorte')
    expect(bestAverageKda(data({ players }))!.subtitle).toBe(
      'El KDA de cada partida, promediado',
    )
  })

  it('the team differences rank per game and not by who played more', () => {
    const teams = [
      // Four games and +40: ten a game.
      team({ team_name: 'Jugó cuatro', games: 4, kill_diff: 40, gold_diff: 40_000, objectives: 20 }),
      // Two games and +30: fifteen a game. It won by more every time it played.
      team({ team_name: 'Jugó dos', games: 2, kill_diff: 30, gold_diff: 30_000, objectives: 14 }),
    ]

    // On totals the first one led all three, which was a ranking of the
    // fixture: some teams get two games in a matchday and others one.
    for (const block of [killDiff(data({ teams })), goldDiff(data({ teams })), topObjectives(data({ teams }))]) {
      expect(block!.rows.map((row) => row.name)).toEqual(['Jugó dos', 'Jugó cuatro'])
    }
  })

  it('the per-game figure travels with its unit', () => {
    const teams = [team({ games: 2, kill_diff: 30, gold_diff: 30_000, objectives: 14 })]

    expect(killDiff(data({ teams }))!.rows[0].display).toBe('+15.0 por partida')
    expect(goldDiff(data({ teams }))!.rows[0].display).toBe('+15.0k por partida')
    expect(topObjectives(data({ teams }))!.rows[0].display).toBe('7.0 por partida')
    // The breakdown stays a count: half a herald is not a thing anybody took.
    expect(topObjectives(data({ teams }))!.rows[0].detail).toBe('1-1 · 4D · 1B · 1H')
  })

  it('the starting five takes the best of each role and not five of one', () => {
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

  it('a champion only banned does not enter the most picked, but does the most banned', () => {
    const rows = [
      champion({ champion: 'Ahri', picks: 5, bans: 0, matches_with_bans: 4 }),
      champion({ champion: 'Yasuo', picks: 0, bans: 4, matches_with_bans: 4, presence: 1 }),
    ]

    expect(mostPicked(data({ champions: rows }))!.rows.map((r) => r.name)).toEqual(['Ahri'])
    expect(mostBanned(data({ champions: rows }))!.rows.map((r) => r.name)).toEqual(['Yasuo'])
  })

  it('the pick count travels with its win rate', () => {
    const block = mostPicked(
      data({
        champions: [
          champion({ champion: 'Ornn', picks: 4, wins: 0, losses: 4, win_pct: 0 }),
          champion({ champion: 'Ahri', picks: 3, wins: 2, losses: 1, win_pct: 0.667 }),
        ],
      }),
    )

    // Four picks and not one win is not the same reading as a bare 4.
    expect(block!.rows.map((row) => row.display)).toEqual(['4 (0% wr)', '3 (67% wr)'])
  })

  it('a champion that was only banned shows no win rate it never earned', () => {
    const block = mostBanned(
      data({
        champions: [champion({ champion: 'Yasuo', picks: 0, wins: 0, losses: 0, win_pct: null, bans: 4, matches_with_bans: 4 })],
      }),
    )

    expect(block!.rows[0].detail).toBe('0 picks · 4 bans')
  })

  it('with no match carrying a draft, the ban blocks do not exist', () => {
    const rows = [champion({ bans: 0, matches_with_bans: 0 })]
    expect(mostBanned(data({ champions: rows }))).toBeNull()
  })

  it("the ranking shows ddragon's name and not the .rofl key", () => {
    const rows = [
      champion({ champion: 'MonkeyKing', picks: 5 }),
      // The .rofl writes the capital S and ddragon does not: the lookup does not care.
      champion({ champion: 'FiddleSticks', picks: 4 }),
      // A champion ddragon does not know yet is shown exactly as it came.
      champion({ champion: 'Recien', picks: 3 }),
    ]

    const block = mostPicked(
      data({
        champions: rows,
        championNames: { monkeyking: 'Wukong', fiddlesticks: 'Fiddlesticks' },
      }),
    )

    expect(block!.rows.map((row) => row.name)).toEqual(['Wukong', 'Fiddlesticks', 'Recien'])
    // The id is still the key: it is what the icon is drawn from.
    expect(block!.rows.map((row) => row.id)).toEqual(['MonkeyKing', 'FiddleSticks', 'Recien'])
  })

  it('without ddragon the champion ranking still comes out, with the internal key', () => {
    const block = mostPicked(data({ champions: [champion({ champion: 'MonkeyKing', picks: 5 })] }))
    expect(block!.rows.map((row) => row.name)).toEqual(['MonkeyKing'])
  })

  it('the university ranking asks for a minimum number of appearances', () => {
    const block = universityStandings(
      data({
        universities: [
          university({ university_id: 'u1', university_tag: 'UNCuyo', appearances: 4, win_pct: 1 }),
          university({ university_id: 'u2', university_tag: 'UNLP', appearances: 40, win_pct: 0.6 }),
        ],
      }),
    )

    // A minimum of 15 appearances in the total (3 matches x 5 players): the
    // one that won its only game with a single player does not head the
    // table.
    expect(block!.rows.map((row) => row.name)).toEqual(['UNLP'])
  })
})
