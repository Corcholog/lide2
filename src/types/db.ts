/**
 * Row types for the tables and views the app queries, written by hand to match
 * `supabase/migrations/`. Update them together with the migrations.
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

  // The tournament slice the match belongs to, resolved by `match_context`
  // (0021_meta_y_bans.sql).
  /** Tournament matchday, 1 to 3. Null in playoffs or when unresolved. */
  matchday: number | null
  group_label: string | null
  phase: StatPhase | null
  slot: number | null
  /** How many bans are entered by hand. 0 = no draft; the .rofl does not carry it. */
  ban_count: number
  /**
   * The matchup was overturned by a ruling: the match stays listed with its
   * scoreboard but counts for no statistic. See 0031_alineacion_indebida.sql.
   */
  annulled: boolean
  ruling: string | null
  ruling_winner_team_id: string | null
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
 * A `player_profiles` row: the public part of a Riot account. It has no
 * `puuid`, which is why the `players` table is not readable without a session.
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
   * Every university on the roster, main one first. Teams formed from
   * individual signups have several.
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
  /**
   * `w.o.`: awarded because a team did not turn up within the 15 minutes the
   * rules allow (unlike `pendiente`, which may still be played).
   * `reglamento`: overturned by the organizers (0031); its match, if any, is
   * annulled.
   */
  status: 'pendiente' | 'sin resultado' | 'jugado' | 'w.o.' | 'reglamento'

  /** Each side's university tags, the main one first. */
  team_a_universities: string[] | null
  team_b_universities: string[] | null

  /**
   * The team awarded the matchup without playing, so the fixture can show
   * "W.O." instead of a score.
   */
  walkover_team_id: string | null
  /** Why the organizers overturned it: a key of `RULINGS`. Null without a ruling. */
  ruling: string | null
}

// --- Stats (supabase/migrations/0010_stats.sql) -----------------------------
//
// The accumulated views return each matchday's rows and the whole-phase rows
// in the same query, told apart by `is_total`. Filtering on `matchday is null`
// is not enough: matches whose matchday is unresolved also have it null.

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
  /** Longest streak without dying (stands in for first blood, which the .rofl lacks). */
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
  /**
   * The average of each game's KDA. Unlike `kda` (the ratio of totals), a
   * deathless game counts in full. See 0025_kda_promedio.sql.
   */
  avg_kda: number
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
 * A `university_totals` row. Counts by appearance (one player in one match),
 * because mixed teams add to several universities at once.
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
 * A `champion_stats` row. `bans` and `presence` only cover matches with a draft
 * entered by hand; `matches_with_bans` says how many, and the UI must show it.
 */
export interface ChampionStatRow extends StatScopeColumns {
  champion: string
  /** The role it was played in most often. */
  position: string | null
  /**
   * Every role it was played in, unordered. Display order (main role first,
   * then by lane) comes from `championRoles` in `@/lib/format`.
   */
  positions: string[]
  picks: number
  wins: number
  losses: number
  /** NULL, not 0, for a champion that was only banned. */
  win_pct: number | null
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
 * Like `champion_stats`, plus the group dimension and precomputed rates. Each
 * scope (whole phase, matchday, group, group and matchday) has its own rows,
 * identified by the `all_*` flags. `group_label is null` cannot replace them:
 * it would also match games with no resolved group.
 *
 * `pick_rate`, `ban_rate` and `presence` are null when their denominator is
 * zero.
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
  /**
   * true = the champion across every role; false = only its picks in the role
   * `position` names (0030). Per-role averages cannot be derived from the whole
   * row, so the view aggregates them separately.
   */
  all_roles: boolean

  champion: string
  /** The role it was played in most often. */
  position: string | null
  /** Every role it was played in, unordered. See `ChampionStatRow.positions`. */
  positions: string[]
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
  /**
   * NULL on a per-role row: bans apply to a champion, not a lane. The same goes
   * for `ban_rate` and `presence`.
   */
  bans: number | null
  matches: number
  /** How many matches in the scope the bans were measured over. */
  matches_with_bans: number
  pick_rate: number | null
  ban_rate: number | null
  presence: number | null
  /** The average of each game's KDA, not the ratio of totals. See 0027_meta_promedios.sql. */
  avg_kda: number
  /** Damage to champions per minute, averaged over the champion's picks. */
  dpm: number
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
 * `declared_*` is what the signup sheet says; `linked_*` is the matched account.
 * It includes `full_name` (legal names), so it is only used when signed in.
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
 * The five role slots always exist and bench slots follow the number of
 * signups. A null `player_id` is a slot with no known occupant yet.
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
   * The lane assigned by hand, as stored, used to preload the edit dropdown.
   * `role` is the effective lane, which comes from played matches when there
   * are any (0023). Null when never set.
   */
  assigned_role: string | null
  /**
   * The nick was entered by hand and the team has played without this account.
   * False for everyone before the first matchday.
   */
  did_not_play: boolean
}

/**
 * A `roster_review` row: a roster issue left by the matchday. Only returned with
 * a session (the view is `security_invoker` over tables with no `anon` policy).
 * See `supabase/migrations/0023_plantel_dinamico.sql`.
 */
export interface RosterReviewRow {
  team_id: string
  team_name: string
  player_id: string
  name: string
  game_name: string | null
  tag_line: string | null
  games: number
  /**
   * `nueva`: played but was not entered; `no_jugo`: entered, but the team played
   * without them; `cambio_de_rol`: played a different lane than assigned. An
   * account can appear under two kinds.
   */
  kind: 'nueva' | 'no_jugo' | 'cambio_de_rol'
  assigned_role: string | null
  played_role: string | null
  /** Never appeared in a replay, so it can be merged into another account. */
  is_placeholder: boolean
  /** Entered by hand at some point, whether or not it played later. */
  hand_entered: boolean
  /** Linked to a signup. The signup's name is not exposed by the view. */
  linked: boolean
  /** On `no_jugo`: the account this one probably turned into. */
  suggested_player_id: string | null
  suggested_name: string | null
  /** Why it is being suggested: `mismo_tag`, `unica` or `mismo_rol`. */
  suggested_reason: 'mismo_tag' | 'unica' | 'mismo_rol' | null
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
