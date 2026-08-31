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
  tournament_id: string | null
  series_id: string | null
  game_number: number | null
  blue_team_logo: string | null
  red_team_logo: string | null

  // El recorte del torneo al que pertenece la partida, resuelto por
  // `match_context` (0021_meta_y_bans.sql). Sale de acá y no de una consulta
  // aparte para que los filtros de /partidas sean un `.eq()` sobre esta vista.
  /** Fecha del torneo, 1 a 3. Null en playoffs o si todavía no se resolvió. */
  matchday: number | null
  group_label: string | null
  phase: StatPhase | null
  slot: number | null
  /** Cuántos bans tiene cargados a mano. 0 = sin draft; el .rofl no lo trae. */
  ban_count: number
}

/** Una fila de `match_bans`: un baneo del draft, cargado a mano en el panel. */
export interface MatchBanRow {
  id: string
  match_id: string
  side: 100 | 200
  champion: string
  /** 1 a 5 dentro de su lado. */
  order_index: number
}

export interface MatchPlayerScoreRow {
  match_player_id: string
  match_id: string
  side: 100 | 200
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
  items: number[]
  summoner_spell_1: string | null
  summoner_spell_2: string | null
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
  player_id: string
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
  player_id: string
  champion: string
  games: number
  wins: number
  kda: number
}

/**
 * Una fila de `player_profiles`: lo público de una cuenta de Riot.
 *
 * Sin `puuid`. La tabla `players` no es legible sin sesión justamente porque su
 * clave es ese identificador, que sirve para preguntarle cosas a la API de Riot
 * sobre esa persona.
 */
export interface PlayerProfileRow {
  player_id: string
  name: string | null
  riot_game_name: string | null
  riot_tag_line: string | null
  display_name: string | null
  last_seen_at: string | null
}

export interface GroupStandingRow {
  tournament_id: string | null
  group_label: string
  team_id: string
  team_name: string
  team_tag: string | null
  team_logo: string | null
  university_id: string | null
  university_name: string | null
  university_tag: string | null
  university_logo: string | null
  games: number
  wins: number
  losses: number
  kills: number
  kills_against: number
  kill_diff: number
  gold_diff: number
  avg_minutes: number | null
  last_played_at: string | null
  /** Últimos 5 resultados, del más nuevo al más viejo. */
  form: boolean[] | null
  position: number
  /**
   * Todas las universidades del plantel, la principal primero. Casi siempre es
   * una sola; los equipos armados con inscripciones individuales tienen varias.
   */
  university_tags: string[]
}

export interface SeriesResultRow {
  id: string
  stage_id: string | null
  tournament_id: string | null
  stage_name: string | null
  stage_order: number | null
  round: string | null
  order_index: number
  best_of: number
  status: string
  scheduled_at: string | null
  team_a_id: string | null
  team_a_name: string | null
  team_a_logo: string | null
  /** De dónde sale el equipo mientras no esté definido: "1o A". */
  slot_a_label: string | null
  team_b_id: string | null
  team_b_name: string | null
  team_b_logo: string | null
  slot_b_label: string | null
  winner_team_id: string | null
  next_series_id: string | null
  next_slot: string | null
  games_played: number
  wins_a: number
  wins_b: number
}

/** Una fila de `fixture_results`: un cruce publicado, con resultado si ya se jugo. */
export interface FixtureResultRow {
  id: string
  tournament_id: string
  stage_id: string | null
  group_label: string
  /** Fecha del torneo, 1 a 3. */
  matchday: number
  /** Turno dentro de la fecha. */
  slot: number
  kickoff: string
  match_id: string | null

  team_a_id: string
  team_a_name: string
  team_a_tag: string | null
  team_a_logo: string | null
  team_a_kills: number | null
  team_a_win: boolean | null

  team_b_id: string
  team_b_name: string
  team_b_tag: string | null
  team_b_logo: string | null
  team_b_kills: number | null
  team_b_win: boolean | null

  played_at: string | null
  game_length_ms: number | null
  ended_in_surrender: boolean | null

  winner_team_id: string | null
  status: 'pendiente' | 'sin resultado' | 'jugado'

  /** Siglas de las universidades de cada lado, la principal primero. */
  team_a_universities: string[] | null
  team_b_universities: string[] | null
}

/** Un equipo que descansa en un turno: en cada uno queda libre uno por grupo. */
export interface FixtureByeRow {
  tournament_id: string
  matchday: number
  slot: number
  kickoff: string
  group_label: string
  team_id: string
  team_name: string
  team_logo: string | null
}

// --- Estadísticas (supabase/migrations/0010_stats.sql) ----------------------
//
// Las cuatro vistas de acumulados comparten el mismo encabezado de recorte y
// devuelven, en la misma consulta, la fila de cada fecha y la fila de toda la
// fase. `is_total` es lo que las separa: el acumulado tiene `matchday: null`,
// pero también lo tiene una partida a la que todavía no se le pudo resolver la
// fecha, así que filtrar por `matchday is null` no alcanza.

export type StatPhase = 'grupos' | 'playoffs'

interface StatScopeColumns {
  tournament_id: string | null
  phase: StatPhase | null
  /** Fecha del torneo. Null en la fila acumulada y en los playoffs. */
  matchday: number | null
  /** "Fecha 2", o el nombre de la ronda en playoffs. */
  round_label: string | null
  /** true = la fila del acumulado; false = la de esa fecha. */
  is_total: boolean
}

/** Una fila de `player_phase_totals`. */
export interface PlayerPhaseTotalsRow extends StatScopeColumns {
  player_id: string | null
  player_name: string | null
  team_id: string | null
  team_name: string | null
  team_tag: string | null
  university_id: string | null
  university_tag: string | null
  /** El rol en el que más jugó, para el quinteto de la fecha. */
  position: string | null

  games: number
  wins: number
  losses: number
  kills: number
  deaths: number
  assists: number
  kda: number
  avg_kills: number
  avg_deaths: number
  avg_assists: number
  kill_participation: number
  damage_share: number
  damage: number
  avg_damage: number
  dpm: number
  damage_taken: number
  damage_mitigated: number
  gold: number
  gpm: number
  cs: number
  csm: number
  vision_score: number
  avg_vision: number
  wards_placed: number
  wards_killed: number
  /** Racha más larga sin morir: reemplaza a los first bloods, que el .rofl no trae. */
  best_killing_spree: number
  best_multi_kill: number
  double_kills: number
  triple_kills: number
  quadra_kills: number
  penta_kills: number
  time_ccing_others: number
  time_dead: number
  avg_score: number
  mvp_count: number
}

/** Una fila de `team_phase_totals`. */
export interface TeamPhaseTotalsRow extends StatScopeColumns {
  team_id: string
  team_name: string | null
  team_tag: string | null
  group_label: string | null
  team_logo: string | null

  games: number
  wins: number
  losses: number
  win_pct: number
  kills: number
  kills_against: number
  kill_diff: number
  gold: number
  gold_diff: number
  avg_minutes: number
  dragons: number
  barons: number
  heralds: number
  turrets: number
  objectives: number
}

/**
 * Una fila de `university_totals`.
 *
 * Se cuenta por aparición (jugador-partida) y no por partido: cuatro equipos
 * mezclan universidades, así que un mismo partido le suma a varias a la vez.
 */
export interface UniversityTotalsRow extends StatScopeColumns {
  university_id: string
  university_tag: string | null
  university_name: string | null
  university_logo: string | null

  matches: number
  teams: number
  players: number
  /** Jugador-partida: un equipo de una sola universidad suma 5 por partido. */
  appearances: number
  wins: number
  losses: number
  win_pct: number
  kills: number
  deaths: number
  assists: number
  kda: number
  damage: number
  gold: number
  vision_score: number
  penta_kills: number
  avg_score: number
}

/**
 * Una fila de `champion_stats`.
 *
 * `bans` y `presence` valen sólo sobre las partidas que tienen el draft cargado
 * a mano; `matches_with_bans` dice sobre cuántas, y la UI tiene que aclararlo.
 */
export interface ChampionStatRow extends StatScopeColumns {
  champion: string
  position: string | null
  picks: number
  wins: number
  losses: number
  win_pct: number
  kills: number
  deaths: number
  assists: number
  kda: number
  avg_damage: number
  avg_score: number
  bans: number
  matches: number
  matches_with_bans: number
  presence: number | null
}

/**
 * Una fila de `champion_meta` (0021_meta_y_bans.sql).
 *
 * El mismo meta que `champion_stats` pero con la dimensión de grupo, y con las
 * tres tasas ya calculadas. Cuatro recortes conviven en la vista —acumulado,
 * por fecha, por grupo, y grupo+fecha— y las dos banderas dicen cuál es cada
 * fila. No se pueden reemplazar por `group_label is null`: ese null puede
 * significar "todos los grupos" o "esta partida no tiene grupo resuelto", que
 * es el mismo problema que resuelve `is_total` en las otras vistas.
 *
 * `pick_rate`, `ban_rate` y `presence` son null cuando su denominador es cero:
 * un campeón que nadie jugó no tiene 0% de winrate, no tiene winrate.
 */
export interface ChampionMetaRow {
  tournament_id: string | null
  phase: StatPhase | null
  group_label: string | null
  matchday: number | null
  round_label: string | null
  /** true = la fila de todos los grupos juntos. */
  all_groups: boolean
  /** true = la fila de toda la fase; false = la de una fecha. */
  all_matchdays: boolean

  champion: string
  position: string | null
  picks: number
  wins: number
  losses: number
  win_pct: number | null
  kills: number
  deaths: number
  assists: number
  kda: number
  avg_damage: number
  avg_score: number
  bans: number
  matches: number
  /** Sobre cuántas partidas del recorte se midieron los bans. */
  matches_with_bans: number
  pick_rate: number | null
  ban_rate: number | null
  presence: number | null
}

/** Una fila de `match_records`: una partida con lo que hace falta para los récords. */
export interface MatchRecordRow {
  match_id: string
  tournament_id: string | null
  phase: StatPhase | null
  group_label: string | null
  matchday: number | null
  slot: number | null
  round_label: string | null
  played_at: string | null
  game_length_ms: number
  minutes: number
  ended_in_surrender: boolean
  patch: string | null

  blue_team_id: string | null
  blue_team_name: string | null
  blue_kills: number
  blue_gold: number
  red_team_id: string | null
  red_team_name: string | null
  red_kills: number
  red_gold: number

  total_kills: number
  kill_gap: number
  gold_gap: number

  winner_team_id: string | null
  winner_name: string | null
  loser_name: string | null
}

// --- Planteles (supabase/migrations/0012_planteles.sql) ---------------------

/**
 * Una fila de `roster_status`: un inscripto y su cuenta de Riot.
 *
 * `declared_*` es lo que dice la planilla; `linked_*` es la cuenta real, y sólo
 * aparece cuando esa persona ya jugó y quedó emparejada.
 *
 * Lleva `full_name`, que son nombres legales: esta fila no sale del login.
 */
export interface RosterStatusRow {
  roster_id: string
  team_id: string
  team_name: string
  group_label: string | null
  order_index: number
  full_name: string
  display_name: string | null
  university_id: string | null
  university_tag: string | null
  declared_game_name: string | null
  declared_tag_line: string | null
  player_id: string | null
  linked_game_name: string | null
  linked_tag_line: string | null
  games: number
}

/** Una fila de `team_accounts`: una cuenta de Riot que juega en un equipo. */
export interface TeamAccountRow {
  team_id: string
  player_id: string
  name: string | null
  riot_game_name: string | null
  riot_tag_line: string | null
  games: number
  /** Si ya está emparejada con un inscripto. */
  linked: boolean
}

/**
 * Un lugar del plantel de un equipo, de `team_lineup`.
 *
 * Es un casillero, no un jugador: los cinco roles existen siempre y los del
 * banco salen de cuántos anotó el equipo. `player_id` en null es un lugar que
 * todavía no se sabe quién ocupa, y se dibuja con el nombre del rol.
 */
export interface TeamLineupRow {
  team_id: string
  /** 1 a 5 los titulares, de Top a Soporte; de 6 en adelante el banco. */
  slot: number
  /** El rol del lugar, o null si es del banco. */
  role: string | null
  /** 1, 2, 3… para los del banco; null para los titulares. */
  sub_number: number | null
  is_substitute: boolean
  player_id: string | null
  name: string | null
  games: number
  /** El nick de Riot pelado; `name` puede ser un alias del panel. */
  game_name: string | null
  /** El `#TAG`, sin el `#`. Null en cuentas viejas que entraron sin tag. */
  tag_line: string | null
  /**
   * La línea asignada a mano, tal cual se guardó. Distinta de `role`: esa es
   * la línea EFECTIVA del casillero (puede venir de las partidas); esta es la
   * que se precarga en el desplegable de edición. Null si nadie la tocó.
   */
  assigned_role: string | null
}

/** Una fila de `tournament_mvp`: el ranking de MVP del recorte. */
export interface TournamentMvpRow extends StatScopeColumns {
  player_id: string | null
  player_name: string | null
  team_id: string | null
  team_name: string | null
  team_tag: string | null
  university_id: string | null
  university_tag: string | null
  position: string | null
  games: number
  wins: number
  kills: number
  deaths: number
  assists: number
  kda: number
  kill_participation: number
  avg_score: number
  mvp_count: number
  mvp_rank: number
}
