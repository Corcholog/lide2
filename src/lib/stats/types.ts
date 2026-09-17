/**
 * Types for the stats engine.
 *
 * The database returns aggregated rows; this code only picks and presents them.
 * Every stat produces a `StatBlock`, so the page and the Instagram cards render
 * all stats from the registry with the same components.
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
 * The slice of the tournament being shown. A null `matchday` means the whole
 * phase, which the database stores as separate rows (`is_total`).
 */
export interface StatScope {
  tournamentId: string
  phase: StatPhase
  /** Tournament matchday (1 to 3), or null for the accumulated total. */
  matchday: number | null
}

/** Everything `loadStats` returns for one scope. */
export interface StatsData {
  scope: StatScope
  players: PlayerPhaseTotalsRow[]
  teams: TeamPhaseTotalsRow[]
  universities: UniversityTotalsRow[]
  champions: ChampionStatRow[]
  records: MatchRecordRow[]
  mvp: TournamentMvpRow[]
  /**
   * Champion display names from ddragon, keyed by internal name. Optional
   * because ddragon may not respond; the internal key is shown instead.
   */
  championNames?: Record<string, string>
  /**
   * The ddragon version for icon URLs, resolved once in `loadStats`. Optional
   * for the same reason; without it champion rankings have no icons.
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
  /** Where the row links to. Universities and champions have no page. */
  href?: string | null
}

/** A resolved stat: title, rows and, where needed, a caveat. */
export interface StatBlock {
  id: string
  title: string
  subtitle?: string | null
  /**
   * How it was measured, when that matters. Mostly for bans, which are entered
   * by hand and may cover only some matches.
   */
  note?: string | null
  rows: StatRow[]
}

/** Section ids stay in Spanish: they become `#jugadores`-style anchors in shared links. */
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
