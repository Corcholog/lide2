import { redirect } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { createClient } from './supabase/server'

/**
 * Session checks. The proxy only redirects for UX; these are the checks that
 * protect pages and route handlers.
 */
export async function getUser(): Promise<User | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

/** For server components: redirects to the login page when there is no session. */
export async function requireUser(): Promise<User> {
  const user = await getUser()
  if (!user) redirect('/login')
  return user
}

/** For route handlers: returns null instead of redirecting. */
export async function requireApiUser(): Promise<User | null> {
  return getUser()
}
