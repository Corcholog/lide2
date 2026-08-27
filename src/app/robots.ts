import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/env'

/**
 * El panel y el login no se indexan.
 *
 * No es una medida de seguridad —eso lo hace el proxy, que pide sesión— sino
 * de higiene: que buscando "LIDE 2" no aparezca la pantalla de login antes que
 * la tabla de posiciones.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/login', '/api/'] },
    sitemap: new URL('/sitemap.xml', siteUrl()).toString(),
  }
}
