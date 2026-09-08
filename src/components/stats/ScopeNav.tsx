import type { MouseEvent } from 'react'
import { Chip } from '@/components/nav/Chip'
import { MATCHDAYS } from '@/lib/stats/scope'
import { withQuery } from '@/lib/url'

/**
 * The matchday picker, shared by /estadisticas, /estadisticas/tablas, /partidas
 * and /admin/cards.
 *
 * `base` is each one's route; the rest - which matchdays exist and what they
 * are called - comes from the calendar, same as the scope.
 *
 * `query` is the page's OTHER filters, which every link has to carry along:
 * without that, picking matchday 2 on /partidas wipes the team being filtered
 * on, and on the tables it wipes the group.
 *
 * NOBODY SHOULD WAIT FOR A MATCHDAY, and the two ways of not waiting are what
 * `onPick` chooses between.
 *
 * Without it, the chips are links to a page that has to be built, and they are
 * prefetched: the four pages behind them are `force-dynamic`, and Next does not
 * prefetch a dynamic route unless it is told to (`prefetch` defaults to "auto",
 * which for these gets as far as the nearest `loading.js` - and there is none).
 * Told to, the payload of the other three is fetched in the background as the
 * bar comes into view and kept in the client cache, so picking one is a
 * client-side transition and not a round trip. In development this does
 * nothing: prefetching only runs in production builds.
 *
 * With `onPick`, the page behind the chips is the one already on screen - that
 * is /partidas, where every match of the phase is already drawn and the
 * matchday is a CSS rule over them. There the click must NOT navigate, and
 * nothing is worth prefetching: the handler writes the URL by hand and the
 * listing narrows without a request. See `MatchFilters`.
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
   * Handles the pick instead of the browser. Given one, the chips stop
   * navigating: they stay real links - for a new tab, for no JavaScript, for
   * pasting - but a plain click is answered here.
   */
  onPick?: (matchday: number | null) => void
}) {
  /*
    A modified click is the browser's and not ours: ctrl, cmd, shift and the
    middle button open the link somewhere else, and there IS a page behind it.
    Checked here, once, instead of in whatever `onPick` happens to do.
  */
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
