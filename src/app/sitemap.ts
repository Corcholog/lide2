import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/env'

/**
 * The site's public pages.
 *
 * Only the fixed ones: team, player and match pages are hundreds of URLs that
 * come from the database, change with every replay uploaded and add nothing to
 * a search. They are reached from here, which is what a crawler needs.
 *
 * There is no player listing: the table that existed was replaced by the one on
 * /estadisticas/tablas, which shows the same thing but scoped by matchday and
 * group and sortable by any column. Each player's page is reached from their
 * team's roster, from a match's detail and from the rankings.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl()
  const routes = ['/', '/estadisticas', '/estadisticas/tablas', '/partidas', '/equipos']

  return routes.map((route) => ({
    url: new URL(route, base).toString(),
    lastModified: new Date(),
    changeFrequency: 'daily' as const,
    priority: route === '/' ? 1 : 0.7,
  }))
}
