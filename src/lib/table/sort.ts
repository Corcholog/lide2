/**
 * Sort order for tables sortable by column.
 *
 * Kept outside the component so it can be tested on its own, and because the
 * order travels in the URL: it is parsed on the server and applied on the
 * client with the same code.
 */

import { firstParam } from '@/lib/url'

export type SortDirection = 'asc' | 'desc'

export interface SortOrder {
  /** The column id, exactly as it travels in `?orden=`. */
  id: string
  dir: SortDirection
}

/**
 * The order requested in the URL, or `fallback` when the column is unknown.
 * An unknown direction falls back to the default direction; a repeated
 * parameter uses its first value.
 */
export function parseSortOrder(
  order: string | string[] | undefined,
  dir: string | string[] | undefined,
  sortable: readonly string[],
  fallback: SortOrder,
): SortOrder {
  const id = firstParam(order)
  const direction = firstParam(dir)

  if (!id || !sortable.includes(id)) return fallback

  return { id, dir: direction === 'asc' || direction === 'desc' ? direction : fallback.dir }
}

/**
 * Sorts a copy of the rows.
 *
 * Nulls always go last, in both directions: a champion nobody played has an
 * unknown win rate, not 0%. This matches `sortTeams` (src/lib/teams/order.ts).
 *
 * A tiebreak is always required; without one, equal values keep whatever order
 * Postgres returned and the table reorders between reloads.
 */
export function sortRows<T>(
  rows: T[],
  key: (row: T) => number | string | null,
  dir: SortDirection,
  tiebreak: (a: T, b: T) => number,
): T[] {
  const sign = dir === 'asc' ? 1 : -1

  return [...rows].sort((a, b) => {
    const va = key(a)
    const vb = key(b)

    if (va === null || vb === null) {
      if (va === vb) return tiebreak(a, b)
      return va === null ? 1 : -1
    }

    const cmp =
      typeof va === 'string' || typeof vb === 'string'
        ? String(va).localeCompare(String(vb), 'es', { numeric: true, sensitivity: 'base' })
        : va - vb

    return cmp === 0 ? tiebreak(a, b) : cmp * sign
  })
}
