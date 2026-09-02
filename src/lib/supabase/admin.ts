import { createClient } from '@supabase/supabase-js'
import { supabaseSecretKey, supabaseUrl } from '../env'

/**
 * Client holding the secret key: it bypasses RLS and can write.
 *
 * Route handlers and server actions only, never in code that reaches the
 * browser. Every ingest write goes through here because the tables deliberately
 * have no insert policies.
 */
export function createAdminClient() {
  return createClient(supabaseUrl(), supabaseSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
