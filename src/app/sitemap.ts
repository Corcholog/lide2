import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/env'

/**
 * Las páginas públicas del sitio.
 *
 * Sólo las fijas: las fichas de equipo, jugador y partida son cientos de URLs
 * que salen de la base, cambian con cada replay que se sube y no aportan nada
 * en una búsqueda. Se llega a ellas desde acá, que es lo que un crawler
 * necesita.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl()
  const rutas = ['/', '/estadisticas', '/partidas', '/equipos', '/jugadores']

  return rutas.map((ruta) => ({
    url: new URL(ruta, base).toString(),
    lastModified: new Date(),
    changeFrequency: 'daily' as const,
    priority: ruta === '/' ? 1 : 0.7,
  }))
}
