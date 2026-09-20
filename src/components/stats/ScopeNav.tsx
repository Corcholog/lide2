import { Chip } from '@/components/nav/Chip'
import { scopeRows, scopeValue } from '@/lib/stats/scope'
import type { StatScope } from '@/lib/stats/types'
import { withQuery } from '@/lib/url'

/**
 * The scope picker, shared by /estadisticas, /estadisticas/tablas and
 * /admin/cards. `query` holds the page's other filters so every link keeps them.
 *
 * Which chips there are, and in which rows, comes from `scopeRows`: /partidas
 * draws the same picker but filters in the browser, and the two must offer the
 * same cuts.
 *
 * Chips are links to server-rendered pages and are prefetched explicitly:
 * these routes are `force-dynamic`, which Next's default prefetch only covers
 * partially. Prefetching only runs in production builds.
 */
export function ScopeNav({
  base,
  scope,
  query = {},
}: {
  base: string
  scope: StatScope
  query?: Record<string, string | number | null | undefined>
}) {
  const current = scopeValue(scope)

  return (
    <div className="flex flex-col gap-1">
      {scopeRows(scope).map((row) => (
        <nav key={row.label} aria-label={row.label} className={ROW}>
          {row.chips.map((chip) => (
            <Chip
              key={chip.value ?? 'total'}
              label={chip.label}
              href={withQuery(base, { ...query, fecha: chip.value })}
              active={current === chip.value}
              prefetch
            />
          ))}
        </nav>
      ))}
    </div>
  )
}

/** Below `sm` the bar scrolls sideways instead of wrapping. */
export const ROW =
  'flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:pb-0'
