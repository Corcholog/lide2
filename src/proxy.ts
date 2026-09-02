import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

/**
 * In Next 16 the middleware is called the proxy. It refreshes the Supabase
 * session and moves unauthenticated visitors out of the way.
 *
 * It is an optimistic check for navigation: the real authorization is done by
 * requireUser() in every page and route handler, close to the data.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
