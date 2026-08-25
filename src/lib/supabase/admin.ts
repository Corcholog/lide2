import { createClient } from '@supabase/supabase-js'
import { supabaseSecretKey, supabaseUrl } from '../env'

/**
 * Cliente con la clave secreta: se saltea RLS y puede escribir.
 *
 * Solo para route handlers y server actions, nunca en codigo que llegue al
 * browser. Las escrituras del ingest pasan todas por aca porque las tablas no
 * tienen politicas de insert a proposito.
 */
export function createAdminClient() {
  return createClient(supabaseUrl(), supabaseSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
