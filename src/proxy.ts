import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

/**
 * En Next 16 el middleware se llama proxy. Refresca la sesion de Supabase y
 * saca del paso a los no autenticados.
 *
 * Es un chequeo optimista para la navegacion: la autorizacion real la hace
 * requireUser() en cada page y route handler, cerca de los datos.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
