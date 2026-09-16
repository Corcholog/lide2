import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/env'

/**
 * Keeps the admin panel and login page out of search results. Not a security
 * measure: the proxy and page checks handle access.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/login', '/api/'] },
    sitemap: new URL('/sitemap.xml', siteUrl()).toString(),
  }
}
