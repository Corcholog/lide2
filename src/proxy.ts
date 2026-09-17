import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

/**
 * Next 16's proxy (formerly middleware): refreshes the Supabase session and
 * redirects signed-out visitors away from private routes. Authorization itself
 * happens in requireUser() in every page and route handler.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
