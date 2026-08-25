import { redirect } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { createClient } from './supabase/server'

/**
 * Chequeo de sesion cerca de los datos. El proxy solo redirige por UX; esta es
 * la verificacion que cuenta, y va en cada page y route handler.
 */
export async function getUser(): Promise<User | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

/** Para server components: redirige al login si no hay sesion. */
export async function requireUser(): Promise<User> {
  const user = await getUser()
  if (!user) redirect('/login')
  return user
}

/** Para route handlers: devuelve null en vez de redirigir. */
export async function requireApiUser(): Promise<User | null> {
  return getUser()
}
