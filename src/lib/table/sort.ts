/**
 * The sort order of a table that can be sorted by column.
 *
 * It lives here and not inside the component for two reasons: it is the part
 * that can be tested without mounting anything, and the order travels in the
 * URL — so the link to "champions sorted by ban rate" can be pasted into the
 * WhatsApp group and opens the same thing — which means it has to be parsed on
 * the server and applied on the client with the very same code.
 */

export type SortDirection = 'asc' | 'desc'

export interface SortOrder {
  /** The column id, exactly as it travels in `?orden=`. */
  id: string
  dir: SortDirection
}

/**
 * The order the URL asked for, or the default.
 *
 * It falls back to the default on anything odd: a column that does not exist,
 * a made-up direction, a repeated parameter. A table drawn in an order other
 * than the one that was asked for is annoying; one that does not draw at all
 * is worse.
 */
export function parseSortOrder(
  order: string | string[] | undefined,
  dir: string | string[] | undefined,
  sortable: readonly string[],
  fallback: SortOrder,
): SortOrder {
  const id = Array.isArray(order) ? order[0] : order
  const direction = Array.isArray(dir) ? dir[0] : dir

  if (!id || !sortable.includes(id)) return fallback

  return { id, dir: direction === 'asc' || direction === 'desc' ? direction : fallback.dir }
}

/**
 * Sorts without touching the original array.
 *
 * Two rules that are not obvious:
 *
 * NULLS ALWAYS GO LAST, in both directions. A champion nobody played has a
 * null win rate, and sorting ascending by win rate it cannot head the table:
 * it is not that they win 0% of the time, it is that nobody knows. This is the
 * same criterion `sortTeams` uses for teams that have not played yet
 * (src/lib/teams/order.ts).
 *
 * THERE IS ALWAYS A TIEBREAK. Without one, two rows holding the same value
 * keep the order Postgres returned them in, which is not guaranteed: the table
 * dances between reloads and looks broken.
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
