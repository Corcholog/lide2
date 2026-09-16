/**
 * Turns database rows into a ranking ready to display: filter, sort, take the
 * top rows and format. Each stat only says which number it ranks and how it is
 * written.
 */

import type { StatBlock, StatRow } from './types'
import { TOP_ROWS } from './types'

/**
 * Minimum games to appear in a ranking of averages.
 *
 * Must match `mvp_min_games()` (migration 0026): the MVP is ranked in SQL and
 * the averages here, so changing only one makes the same page apply two rules.
 * It is 1 so that every player who has played shows up from the first matchday,
 * when some teams have played a single game.
 */
export function minGamesForAverages(): number {
  return 1
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
 * Builds the block, or returns null when it has no rows, so the page skips
 * rankings with nobody in them.
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
