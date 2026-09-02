import { Chip } from '@/components/nav/Chip'
import { withQuery } from '@/lib/url'

/**
 * The two ways of looking at the stats.
 *
 * RANKINGS is the top five of everything: what happened in the tournament, read
 * at a glance. It is the same thing that gets published to social media from
 * /admin/cards, and that is why it is built the way it is.
 *
 * TABLES is everything, sortable and filterable: it serves for finding
 * yourself, seeing the whole champion pool or comparing two teams. A player
 * coming in to see how they did is not here for the tournament's top five.
 *
 * They are two routes and not a `?vista=` because they load different data -
 * Rankings runs seven queries, Tables three - and each has its own title. And
 * they are links and not `role="tablist"`: this is navigation between pages,
 * not tabs within one document.
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
