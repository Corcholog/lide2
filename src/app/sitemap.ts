import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/env'

/**
 * Las páginas públicas del sitio.
 *
 * Sólo las fijas: las fichas de equipo, jugador y partida son cientos de URLs
 * que salen de la base, cambian con cada replay que se sube y no aportan nada
 * en una búsqueda. Se llega a ellas desde acá, que es lo que un crawler
 * necesita.
 *
 * No hay listado de jugadores: la tabla que había quedó reemplazada por la de
 * /estadisticas/tablas, que muestra lo mismo pero recortado por fecha y grupo y
 * ordenable por cualquier columna. A la ficha de cada uno se llega desde el
 * plantel de su equipo, desde el detalle de una partida y desde los rankings.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl()
  const rutas = ['/', '/estadisticas', '/estadisticas/tablas', '/partidas', '/equipos']

  return rutas.map((ruta) => ({
    url: new URL(ruta, base).toString(),
    lastModified: new Date(),
    changeFrequency: 'daily' as const,
    priority: ruta === '/' ? 1 : 0.7,
  }))
}
