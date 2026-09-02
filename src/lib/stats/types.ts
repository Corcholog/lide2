/**
 * The vocabulary of the stats engine.
 *
 * The idea behind it: the database already returns everything aggregated (one
 * row per player and matchday, per team, per university, per champion), so
 * nothing heavy is computed here. What this module does is *pick and present*:
 * sort by each ranking's criterion, cut the top and leave every row with a
 * name, a number and a unit, ready for a table or for an Instagram card.
 *
 * That is why every stat ends in the same shape (`StatBlock`): the page and the
 * cards iterate over the registry instead of repeating markup for each one, and
 * adding a new stat means adding a function, not a screen.
 */

import type {
  ChampionStatRow,
  MatchRecordRow,
  PlayerPhaseTotalsRow,
  StatPhase,
  TeamPhaseTotalsRow,
  TournamentMvpRow,
  UniversityTotalsRow,
} from '@/types/db'

/**
 * Which slice of the tournament is being looked at.
 *
 * A null `matchday` means "the whole phase". That is not the same as matchday
 * 1: in the database they are different rows (`is_total`), precisely so the two
 * cannot be mixed up.
 */
export interface StatScope {
  tournamentId: string
  phase: StatPhase
  /** Tournament matchday (1 to 3), or null for the accumulated total. */
  matchday: number | null
}

/** Everything the database returns for one scope, in five queries. */
export interface StatsData {
  scope: StatScope
  players: PlayerPhaseTotalsRow[]
  teams: TeamPhaseTotalsRow[]
  universities: UniversityTotalsRow[]
  champions: ChampionStatRow[]
  records: MatchRecordRow[]
  mvp: TournamentMvpRow[]
  /**
   * The only thing that does not come from the database: each champion's
   * display name, from ddragon.
   *
   * The database stores the internal key from the .rofl ("MonkeyKing"), which
   * does not work as a name in a ranking. It is optional because ddragon may
   * not answer, and then the key is shown: a ranking with ugly names is still
   * the right ranking.
   */
  championNames?: Record<string, string>
  /**
   * The ddragon version the icon URLs are built with.
   *
   * It travels here instead of being resolved inside every builder because it
   * is a network call: it happens once in `loadStats` and rides along with the
   * rest of the data. Optional for the same reason as the names — ddragon can
   * go down — and without it the champion rankings come out with no icon, which
   * looks worse but reads the same.
   */
  assetVersion?: string
}

/** One position in a ranking. */
export interface StatRow {
  /** For the React key. Unique within the block. */
  id: string
  name: string
  /** Team, university, role: whatever places the row. */
  subtitle?: string | null
  logo?: string | null
  /** The raw number, for sorting or exporting. */
  value: number
  /** The same number already formatted, with its unit. */
  display: string
  /** Short context: "17/4/9", "4 partidas". */
  detail?: string | null
  /**
   * Where the row leads, if it leads anywhere.
   *
   * A ranking of matches or of players is an index: the name being read is
   * already that of a page which exists, and not being able to click it forces
   * you to go find it some other way. University and champion rankings have no
   * page of their own, so their rows are not links.
   */
  href?: string | null
}

/** A resolved stat: title, rows and, where needed, a caveat. */
export interface StatBlock {
  id: string
  title: string
  subtitle?: string | null
  /**
   * A note on how it was measured. Used mostly for bans, which are entered by
   * hand and may cover only part of the matches: unsaid, a "60% presence" reads
   * as if it covered the whole tournament.
   */
  note?: string | null
  rows: StatRow[]
}

/**
 * The section ids stay in Spanish because they are content, not code: they end
 * up as the `#jugadores` anchors of /estadisticas, which people paste around.
 */
export type StatSection = 'jugadores' | 'equipos' | 'universidades' | 'meta' | 'records'

/** A stat in the registry: what it is called and how it is computed. */
export interface StatDefinition {
  id: string
  title: string
  subtitle?: string
  section: StatSection
  /** Returns null when there is not enough data to show it. */
  build: (data: StatsData) => StatBlock | null
}

/** How many rows each ranking shows. */
export const TOP_ROWS = 5
