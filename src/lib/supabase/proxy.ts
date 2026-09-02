import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { supabasePublishableKey, supabaseUrl } from '../env'

/**
 * Routes that require a session. Everything else is public.
 *
 * It used to be the other way round - a list of public routes with everything
 * else closed - and it was flipped when the site opened up to visitors. The
 * default went from "closed unless stated" to "open unless stated", so a new
 * admin route that is not listed here is out in the open.
 *
 * This is only UX either way: what actually protects the data is RLS (see
 * supabase/migrations/0013_publico.sql) and the `requireUser()` in every page
 * and every server action. The proxy only keeps a visitor from landing on an
 * empty screen.
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

  // API routes are never redirected: a fetch that follows the redirect gets
  // the login HTML and fails to parse the JSON with an indecipherable error.
  // Every route handler returns its own 401 through requireApiUser().
  if (pathname.startsWith('/api/')) {
    return response
  }

  if (!user && isPrivate) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    // The destination takes its query with it: /admin/cards?fecha=2 has to
    // come back to matchday 2, not to the accumulated total. It is cleared
    // first so the original's parameters are not left loose next to `next`,
    // pointing nowhere.
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
