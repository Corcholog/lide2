import { Chip } from '@/components/nav/Chip'
import { ROLE_OPTIONS, type RoleOption } from '@/lib/stats/tables'
import { withQuery } from '@/lib/url'

/**
 * The role picker on the Tables tab. Like the other pickers, it keeps the other
 * filters. It filters the champion and player tables; the team table has no
 * role and says so.
 */
export function RoleNav({
  base,
  role,
  query = {},
}: {
  base: string
  /** The selected role, or null for all roles. */
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
