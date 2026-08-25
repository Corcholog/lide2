import { createBrowserClient } from '@supabase/ssr'
import { supabasePublishableKey, supabaseUrl } from '../env'

/** Cliente para componentes cliente (login y subida de archivos). */
export function createClient() {
  return createBrowserClient(supabaseUrl(), supabasePublishableKey())
}
