import { Chip } from '@/components/nav/Chip'
import { withQuery } from '@/lib/url'

/**
 * Switches between the two stats views: Rankings (the top five of each stat,
 * the same pieces published from /admin/cards) and Tables (every row,
 * sortable and filterable). Separate routes because they load different data,
 * and links rather than `role="tablist"` because they navigate between pages.
 */
export function ViewNav({
  active,
  query = {},
}: {
  active: 'rankings' | 'tablas'
  query?: Record<string, string | number | null | undefined>
}) {
  return (
    <nav aria-label="Vista" className="flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:pb-0">
      <Chip
        label="Rankings"
        href={withQuery('/estadisticas', query)}
        active={active === 'rankings'}
      />
      <Chip
        label="Tablas"
        href={withQuery('/estadisticas/tablas', query)}
        active={active === 'tablas'}
      />
    </nav>
  )
}
