import { Chip } from '@/components/nav/Chip'
import { MATCHDAYS, ROUNDS, scopeValue } from '@/lib/stats/scope'
import type { StatScope } from '@/lib/stats/types'
import { withQuery } from '@/lib/url'

/**
 * The scope picker, shared by /estadisticas, /estadisticas/tablas and
 * /admin/cards. `query` holds the page's other filters so every link keeps them.
 *
 * Two rows rather than one: nine chips side by side read as a wall, and the
 * matchdays and the playoff rounds are not alternatives to each other. The
 * first row picks the phase, the second one narrows inside it and only appears
 * once there is something to narrow. The whole tournament has no second row,
 * which is itself the signal that nothing is being narrowed.
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

  const chip = (label: string, value: string | null) => (
    <Chip
      key={value ?? 'total'}
      label={label}
      href={withQuery(base, { ...query, fecha: value })}
      active={current === value}
      prefetch
    />
  )

  /*
    Which phase the second row belongs to. A matchday is inside the groups and
    a round inside the playoffs, so picking one keeps its row open.
  */
  const phase = scope.kind === 'torneo' ? null : scope.phase

  return (
    <div className="flex flex-col gap-1">
      <nav aria-label="Recorte" className={ROW}>
        {chip('Total', null)}
        {chip('Grupos', 'grupos')}
        {chip('Playoffs', 'playoffs')}
      </nav>

      {phase !== null && (
        <nav aria-label={phase === 'grupos' ? 'Fecha' : 'Ronda'} className={ROW}>
          {phase === 'grupos'
            ? MATCHDAYS.map((entry) => chip(entry.label, String(entry.matchday)))
            : ROUNDS.map((entry) => chip(entry.label, entry.id))}
        </nav>
      )}
    </div>
  )
}

/** Below `sm` the bar scrolls sideways instead of wrapping. */
const ROW =
  'flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:pb-0'
