/**
 * Filas de las vistas que consulta la app.
 *
 * Escritas a mano por ahora; cuando el proyecto de Supabase este creado se
 * reemplazan por las generadas con `supabase gen types typescript`.
 */

export interface MatchSummaryRow {
  id: string
  played_at: string | null
  patch: string | null
  game_length_ms: number
  stage_label: string | null
  round_label: string | null
  riot_match_id: string | null
  winning_side: 100 | 200 | null
  ended_in_surrender: boolean
  blue_team_id: string | null
  blue_team_name: string | null
  red_team_id: string | null
  red_team_name: string | null
  blue_kills: number | null
  blue_gold: number | null
  red_kills: number | null
  red_gold: number | null
  mvp_name: string | null
  mvp_champion: string | null
  mvp_kills: number | null
  mvp_deaths: number | null
  mvp_assists: number | null
  mvp_score: number | null
  file_count: number
}

export interface MatchPlayerScoreRow {
  match_player_id: string
  match_id: string
  side: 100 | 200
  puuid: string
  player_id: string | null
  team_id: string | null
  riot_game_name: string | null
  riot_tag_line: string | null
  champion: string
  position: string | null
  win: boolean
  kills: number
  deaths: number
  assists: number
  cs: number
  gold_earned: number
  damage_to_champions: number
  vision_score: number
  kda: number
  kill_participation: number
  damage_share: number
  dpm: number
  gpm: number
  csm: number
  score: number
  score_pct: number
  match_rank: number
}

export interface MatchTeamStatsRow {
  match_id: string
  side: 100 | 200
  win: boolean
  kills: number
  deaths: number
  assists: number
  gold: number
  damage_to_champions: number
  damage_taken: number
  cs: number
  vision_score: number
  wards_placed: number
  turrets: number
  inhibitors: number
  dragons: number
  barons: number
  heralds: number
  atakhans: number
  void_grubs: number
  team_id: string | null
}

export interface TeamStandingRow {
  stage_label: string | null
  team_id: string
  team_name: string
  team_tag: string | null
  games: number
  wins: number
  losses: number
  win_pct: number
  kills: number
  kills_against: number
  kill_diff: number
  gold_diff: number
  avg_minutes: number | null
  first_played_at: string | null
  last_played_at: string | null
  /** Últimos 5 resultados, del más nuevo al más viejo. */
  form: boolean[] | null
  position: number
}

export interface PlayerTotalsRow {
  puuid: string
  player_id: string | null
  riot_game_name: string | null
  riot_tag_line: string | null
  display_name: string | null
  team_id: string | null
  games: number
  wins: number
  avg_kills: number
  avg_deaths: number
  avg_assists: number
  kda: number
  kills: number
  deaths: number
  assists: number
  avg_cs: number
  avg_gold: number
  avg_damage: number
  avg_vision: number
  penta_kills: number
  quadra_kills: number
  avg_score: number
  mvp_count: number
}

export interface PlayerChampionRow {
  puuid: string
  champion: string
  games: number
  wins: number
  kda: number
}
