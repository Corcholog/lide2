import { Chip } from '@/components/nav/Chip'
import { GROUP_OPTIONS } from '@/lib/stats/tables'
import { withQuery } from '@/lib/url'

/**
 * The group picker on the Tables tab. Each picker keeps the other filters, so
 * they can be combined in any order.
 */
export function GroupNav({
  base,
  group,
  query = {},
}: {
  base: string
  /** The stored label ("Grupo B"), or null for all groups. */
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
