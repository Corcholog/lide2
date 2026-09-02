/**
 * Rows of the views the app queries.
 *
 * Written by hand for now; once the Supabase project exists they get replaced
 * by the ones generated with `supabase gen types typescript`.
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

  // The slice of the tournament the match belongs to, resolved by
  // `match_context` (0021_meta_y_bans.sql). It comes from here and not from a
  // separate query so /partidas' filters are an `.eq()` over this view.
  /** Tournament matchday, 1 to 3. Null in playoffs or when unresolved. */
  matchday: number | null
  group_label: string | null
  phase: StatPhase | null
  slot: number | null
  /** How many bans are entered by hand. 0 = no draft; the .rofl does not carry it. */
  ban_count: number
}

/** A `match_bans` row: one ban from the draft, entered by hand in the panel. */
export interface MatchBanRow {
  id: string
  match_id: string
  side: 100 | 200
  champion: string
  /** 1 to 5 within its side. */
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
  /** The last 5 results, newest first. */
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
 * A `player_profiles` row: the public part of a Riot account.
 *
 * No `puuid`. The `players` table is not readable without a session precisely
 * because its key is that identifier, which can be used to ask Riot's API
 * things about that person.
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
  /** The last 5 results, newest first. */
  form: boolean[] | null
  position: number
  /**
   * Every university on the roster, the main one first. Nearly always just one;
   * the teams built from individual signups have several.
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
  /** Where the team comes from while it is undecided: "1o A". */
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

/** A `fixture_results` row: a published matchup, with its result once played. */
export interface FixtureResultRow {
  id: string
  tournament_id: string
  stage_id: string | null
  group_label: string
  /** Tournament matchday, 1 to 3. */
  matchday: number
  /** Slot within the matchday. */
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

  /** Each side's university tags, the main one first. */
  team_a_universities: string[] | null
  team_b_universities: string[] | null
}

/** A team resting in a slot: one per group sits out each one. */
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

// --- Stats (supabase/migrations/0010_stats.sql) -----------------------------
//
// The four accumulated views share the same scope header and return, in the
// same query, each matchday's row and the row for the whole phase. `is_total`
// is what tells them apart: the accumulated one has `matchday: null`, but so
// does a match whose matchday could not be resolved yet, so filtering on
// `matchday is null` is not enough.

export type StatPhase = 'grupos' | 'playoffs'

interface StatScopeColumns {
  tournament_id: string | null
  phase: StatPhase | null
  /** Tournament matchday. Null in the accumulated row and in playoffs. */
  matchday: number | null
  /** "Fecha 2", or the round's name in playoffs. */
  round_label: string | null
  /** true = the accumulated row; false = that matchday's. */
  is_total: boolean
}

/** A `player_phase_totals` row. */
export interface PlayerPhaseTotalsRow extends StatScopeColumns {
  player_id: string | null
  player_name: string | null
  team_id: string | null
  team_name: string | null
  team_tag: string | null
  university_id: string | null
  university_tag: string | null
  /** The role played most, for the matchday's starting five. */
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
  /** Longest streak without dying: it replaces first bloods, which the .rofl lacks. */
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

/** A `team_phase_totals` row. */
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
 * A `university_totals` row.
 *
 * It counts by appearance (player-match) and not by match: four teams mix
 * universities, so one match adds to several at once.
 */
export interface UniversityTotalsRow extends StatScopeColumns {
  university_id: string
  university_tag: string | null
  university_name: string | null
  university_logo: string | null

  matches: number
  teams: number
  players: number
  /** Player-match: a single-university team adds 5 per match. */
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
 * A `champion_stats` row.
 *
 * `bans` and `presence` hold only over the matches whose draft was entered by
 * hand; `matches_with_bans` says over how many, and the UI has to spell it
 * out.
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
 * A `champion_meta` row (0021_meta_y_bans.sql).
 *
 * The same meta as `champion_stats` but with the group dimension, and with the
 * three rates already computed. Four scopes coexist in the view - accumulated,
 * by matchday, by group, and group+matchday - and the two flags say which row
 * is which. They cannot be replaced by `group_label is null`: that null can
 * mean "every group" or "this match has no group resolved", which is the same
 * problem `is_total` solves in the other views.
 *
 * `pick_rate`, `ban_rate` and `presence` are null when their denominator is
 * zero: a champion nobody played does not have a 0% win rate, it has none.
 */
export interface ChampionMetaRow {
  tournament_id: string | null
  phase: StatPhase | null
  group_label: string | null
  matchday: number | null
  round_label: string | null
  /** true = the row for every group together. */
  all_groups: boolean
  /** true = the row for the whole phase; false = one matchday's. */
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
  /** How many matches in the scope the bans were measured over. */
  matches_with_bans: number
  pick_rate: number | null
  ban_rate: number | null
  presence: number | null
}

/** A `match_records` row: a match with what the records need. */
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

// --- Rosters (supabase/migrations/0012_planteles.sql) ----------------------

/**
 * A `roster_status` row: a signup and their Riot account.
 *
 * `declared_*` is what the sheet says; `linked_*` is the real account, and it
 * only appears once that person has played and got matched.
 *
 * It carries `full_name`, which are legal names: this row never leaves the
 * signed-in side.
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

/** A `team_accounts` row: a Riot account that plays for a team. */
export interface TeamAccountRow {
  team_id: string
  player_id: string
  name: string | null
  riot_game_name: string | null
  riot_tag_line: string | null
  games: number
  /** Whether it is already matched with a signup. */
  linked: boolean
}

/**
 * One slot in a team's lineup, from `team_lineup`.
 *
 * It is a slot, not a player: the five roles always exist and the bench ones
 * come from how many the team signed up. A null `player_id` is a slot whose
 * occupant is not known yet, and it is drawn with the role's name.
 */
export interface TeamLineupRow {
  team_id: string
  /** 1 to 5 are the starters, from Top to Support; 6 upwards is the bench. */
  slot: number
  /** The slot's role, or null when it is a bench one. */
  role: string | null
  /** 1, 2, 3… for the bench ones; null for the starters. */
  sub_number: number | null
  is_substitute: boolean
  player_id: string | null
  name: string | null
  games: number
  /** The bare Riot nick; `name` may be an alias from the panel. */
  game_name: string | null
  /** The `#TAG`, without the `#`. Null on old accounts that came in without one. */
  tag_line: string | null
  /**
   * The lane assigned by hand, exactly as stored. Different from `role`: that
   * one is the slot's EFFECTIVE lane (it may come from the matches); this one
   * is what preloads the edit dropdown. Null when nobody touched it.
   */
  assigned_role: string | null
}

/** A `tournament_mvp` row: the scope's MVP ranking. */
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
