import type { MouseEvent } from 'react'
import { Chip } from '@/components/nav/Chip'
import { MATCHDAYS } from '@/lib/stats/scope'
import { withQuery } from '@/lib/url'

/**
 * The matchday picker, shared by /estadisticas, /estadisticas/tablas, /partidas
 * and /admin/cards. `query` holds the page's other filters so every link keeps
 * them.
 *
 * Without `onPick`, chips are links to server-rendered pages and are prefetched
 * explicitly: these routes are `force-dynamic`, which Next's default prefetch
 * only covers partially. Prefetching only runs in production builds.
 *
 * With `onPick` (/partidas, where every match is already rendered and filtering
 * is CSS), a plain click does not navigate and nothing is prefetched; the
 * handler updates the URL. See `MatchFilters`.
 */
export function ScopeNav({
  base,
  matchday,
  query = {},
  onPick,
}: {
  base: string
  matchday: number | null
  query?: Record<string, string | number | null | undefined>
  /**
   * Handles plain clicks instead of navigating. Chips stay real links for new
   * tabs, sharing and no-JavaScript use.
   */
  onPick?: (matchday: number | null) => void
}) {
  // Modified clicks (ctrl, cmd, shift, middle button) are left to the browser.
  const pick = onPick
    ? (value: number | null) => (event: MouseEvent<HTMLAnchorElement>) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
        event.preventDefault()
        onPick(value)
      }
    : undefined

  const chip = (label: string, value: number | null) => (
    <Chip
      key={value ?? 'total'}
      label={label}
      href={withQuery(base, { ...query, fecha: value })}
      active={matchday === value}
      prefetch={onPick ? false : true}
      onClick={pick?.(value)}
    />
  )

  return (
    <nav aria-label="Recorte" className="flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:pb-0">
      {chip('Toda la fase', null)}
      {MATCHDAYS.map((entry) => chip(entry.label, entry.matchday))}
    </nav>
  )
}
