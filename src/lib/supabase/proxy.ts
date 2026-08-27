import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { supabasePublishableKey, supabaseUrl } from '../env'

/**
 * Rutas que piden sesion. Todo lo demas es publico.
 *
 * Antes era al reves —una lista de rutas publicas y todo lo demas cerrado— y se
 * dio vuelta cuando el sitio se abrio a los visitantes. El default cambio de
 * "cerrado salvo que se diga" a "abierto salvo que se diga", asi que una ruta
 * nueva del panel que no se anote aca queda a la vista.
 *
 * Igual esto es solo UX: lo que de verdad protege los datos es el RLS (ver
 * supabase/migrations/0013_publico.sql) y el `requireUser()` de cada pagina y
 * cada server action. El proxy solo evita que un visitante llegue a una
 * pantalla vacia.
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

  // No meter codigo entre createServerClient y getUser: rompe el refresh de la
  // sesion de formas dificiles de debuggear.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isPrivate = PRIVATE_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))

  // Las rutas de API nunca se redirigen: un fetch que sigue el redirect recibe
  // el HTML del login y falla al parsear el JSON con un error indescifrable.
  // Cada route handler devuelve su propio 401 con requireApiUser().
  if (pathname.startsWith('/api/')) {
    return response
  }

  if (!user && isPrivate) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    // El destino se lleva su query: a /admin/cards?fecha=2 hay que volver a la
    // fecha 2, no al acumulado. Se limpia primero para no dejar los parámetros
    // del original sueltos al lado del `next`, apuntando a la nada.
    const destino = `${pathname}${request.nextUrl.search}`
    url.search = ''
    url.searchParams.set('next', destino)
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
