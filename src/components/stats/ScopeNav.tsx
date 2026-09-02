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
 */
export function ScopeNav({
  base,
  matchday,
  query = {},
}: {
  base: string
  matchday: number | null
  query?: Record<string, string | number | null | undefined>
}) {
  return (
    <nav aria-label="Recorte" className="flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:pb-0">
      <Chip
        label="Toda la fase"
        href={withQuery(base, { ...query, fecha: null })}
        active={matchday === null}
      />
      {MATCHDAYS.map((entry) => (
        <Chip
          key={entry.matchday}
          label={entry.label}
          href={withQuery(base, { ...query, fecha: entry.matchday })}
          active={matchday === entry.matchday}
        />
      ))}
    </nav>
  )
}
