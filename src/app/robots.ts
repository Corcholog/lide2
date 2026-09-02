import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/env'

/**
 * The admin panel and the login page are not indexed.
 *
 * It is not a security measure - the proxy does that, asking for a session -
 * but a matter of hygiene: searching for "LIDE 2" should not turn up the login
 * screen ahead of the standings table.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/login', '/api/'] },
    sitemap: new URL('/sitemap.xml', siteUrl()).toString(),
  }
}
