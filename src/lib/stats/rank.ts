/**
 * Turns database rows into a ranking that is ready to show.
 *
 * Every stat does the same thing — filter, sort, cut the top and format — so
 * that lives here once and each stat comes down to saying which number it
 * looks at and how it is written.
 */

import type { StatBlock, StatRow, StatScope } from './types'
import { TOP_ROWS } from './types'

/**
 * Minimum games to enter a ranking of averages.
 *
 * Same rule as `mvp_min_games()` in supabase/migrations/0010_stats.sql and for
 * the same reason: within one matchday a team plays one or two games, so having
 * played at all is enough, but across the whole phase there are four and
 * somebody who showed up once cannot head an average. Rankings of totals
 * (kills, damage) do not need it: accumulating already rewards whoever played.
 *
 * The MVP is decided by the SQL function, not by this one; the rule is mirrored
 * here for the rankings that are built in memory.
 */
export function minGamesForAverages(scope: StatScope): number {
  return scope.matchday === null ? 3 : 1
}

export interface RankOptions<T> {
  /** The number that is sorted on. */
  value: (row: T) => number
  /** How that number is written, with its unit. */
  display: (value: number, row: T) => string
  id: (row: T) => string
  name: (row: T) => string
  subtitle?: (row: T) => string | null
  logo?: (row: T) => string | null
  /** Where the row leads. Without this it is not a link. */
  href?: (row: T) => string | null
  detail?: (row: T) => string | null
  /** Rows that do not qualify. By default every row is in. */
  eligible?: (row: T) => boolean
  /** `asc` for "the fewest": shortest games, fewest deaths. */
  order?: 'desc' | 'asc'
  /** Tiebreak. Without it two equal values keep the order the query returned. */
  tiebreak?: (a: T, b: T) => number
  limit?: number
}

export function rankRows<T>(rows: T[], options: RankOptions<T>): StatRow[] {
  const {
    value,
    display,
    id,
    name,
    subtitle,
    logo,
    href,
    detail,
    eligible,
    order = 'desc',
    tiebreak,
    limit = TOP_ROWS,
  } = options

  return rows
    .filter((row) => (eligible ? eligible(row) : true))
    .sort((a, b) => {
      const diff = order === 'desc' ? value(b) - value(a) : value(a) - value(b)
      if (diff !== 0) return diff
      return tiebreak ? tiebreak(a, b) : 0
    })
    .slice(0, limit)
    .map((row) => ({
      id: id(row),
      name: name(row),
      subtitle: subtitle?.(row) ?? null,
      logo: logo?.(row) ?? null,
      href: href?.(row) ?? null,
      detail: detail?.(row) ?? null,
      value: value(row),
      display: display(value(row), row),
    }))
}

/**
 * Builds the block, or null when it came out empty.
 *
 * Returning null instead of a block with no rows is deliberate: the page does
 * not draw the titles of rankings that have nobody in them. Before the first
 * matchday, that is the entire listing.
 */
export function block(
  id: string,
  title: string,
  rows: StatRow[],
  extra: { subtitle?: string | null; note?: string | null } = {},
): StatBlock | null {
  if (rows.length === 0) return null
  return { id, title, rows, subtitle: extra.subtitle ?? null, note: extra.note ?? null }
}
