import { createBrowserClient } from '@supabase/ssr'
import { supabasePublishableKey, supabaseUrl } from '../env'

/** Client for client components (login and file uploads). */
export function createClient() {
  return createBrowserClient(supabaseUrl(), supabasePublishableKey())
}
