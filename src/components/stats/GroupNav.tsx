import { Chip } from '@/components/nav/Chip'
import { GROUP_OPTIONS } from '@/lib/stats/tables'
import { withQuery } from '@/lib/url'

/**
 * The group picker on the Tables tab.
 *
 * It combines with the matchday one: each carries the other's filter along, so
 * "Grupo B, fecha 2" can be reached by picking one and then the other, in
 * whichever order.
 */
export function GroupNav({
  base,
  group,
  query = {},
}: {
  base: string
  /** The stored label ("Grupo B"), or null when it is all of them. */
  group: string | null
  query?: Record<string, string | number | null | undefined>
}) {
  return (
    <nav aria-label="Grupo" className="flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:pb-0">
      <Chip
        label="Todos"
        href={withQuery(base, { ...query, grupo: null })}
        active={group === null}
      />
      {GROUP_OPTIONS.map((entry) => (
        <Chip
          key={entry.id}
          label={entry.label}
          href={withQuery(base, { ...query, grupo: entry.id })}
          active={group === entry.label}
        />
      ))}
    </nav>
  )
}
