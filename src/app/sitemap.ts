import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/env'

/**
 * The site's fixed public pages. Team, player and match pages come from the
 * database and are reached by following links from these.
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
