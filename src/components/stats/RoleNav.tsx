import { Chip } from '@/components/nav/Chip'
import { ROLE_OPTIONS, type RoleOption } from '@/lib/stats/tables'
import { withQuery } from '@/lib/url'

/**
 * The role picker on the Tables tab.
 *
 * Third of the three that stack there, and like the other two it carries the
 * others' filters along so "Grupo B, fecha 2, junglas" can be reached by
 * picking them in any order.
 *
 * It only recuts the two tables that have a Rol column. The teams one keeps
 * every row - a team does not have a role - and says so underneath.
 */
export function RoleNav({
  base,
  role,
  query = {},
}: {
  base: string
  /** The selected role, or null when it is every one of them. */
  role: RoleOption | null
  query?: Record<string, string | number | null | undefined>
}) {
  return (
    <nav aria-label="Rol" className="flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:pb-0">
      <Chip label="Todos" href={withQuery(base, { ...query, rol: null })} active={role === null} />
      {ROLE_OPTIONS.map((entry) => (
        <Chip
          key={entry.id}
          label={entry.label}
          href={withQuery(base, { ...query, rol: entry.id })}
          active={role?.id === entry.id}
        />
      ))}
    </nav>
  )
}
