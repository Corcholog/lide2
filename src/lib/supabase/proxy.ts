import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { supabasePublishableKey, supabaseUrl } from '../env'

/**
 * Routes that require a session; everything else is public, so a new admin
 * route must be added here.
 *
 * This is only for UX. Data is protected by RLS (see
 * supabase/migrations/0013_publico.sql) and by `requireUser()` in every admin
 * page and server action.
 */
const PRIVATE_PATHS = ['/admin', '/equipos/detectar']

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value)
        }
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }
      },
    },
  })

  // Do not put code between createServerClient and getUser: it breaks the
  // session refresh in ways that are hard to debug.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isPrivate = PRIVATE_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))

  // API routes are never redirected: a fetch following the redirect would get
  // the login HTML and fail to parse JSON. Route handlers return their own 401
  // through requireApiUser().
  if (pathname.startsWith('/api/')) {
    return response
  }

  if (!user && isPrivate) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    // Keep the query string (/admin/cards?fecha=2 must return to matchday 2).
    const destination = `${pathname}${request.nextUrl.search}`
    url.search = ''
    url.searchParams.set('next', destination)
    return NextResponse.redirect(url)
  }

  if (user && pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return response
}
