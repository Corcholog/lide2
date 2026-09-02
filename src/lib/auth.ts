import { redirect } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { createClient } from './supabase/server'

/**
 * The session check, kept close to the data. The proxy only redirects for the
 * sake of UX; this is the verification that counts, and it goes in every page
 * and route handler.
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
