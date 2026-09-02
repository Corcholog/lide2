import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { supabasePublishableKey, supabaseUrl } from '../env'

/** Client carrying the user's session, for server components and route handlers. */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Called from a server component: the proxy already refreshes the session.
        }
      },
    },
  })
}
