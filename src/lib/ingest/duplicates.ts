import { createAdminClient } from '../supabase/admin'

/**
 * Busca un archivo ya guardado con exactamente los mismos bytes.
 *
 * Es distinto de la deduplicación por huella de partida: acá se detecta el
 * mismo archivo subido dos veces (mismo sha256), y sirve para evitar la subida
 * antes de gastar la cuota. La huella, en cambio, une los dos .rofl distintos
 * que graban los clientes de los dos equipos de una misma partida.
 */
export async function findFileBySha256(sha256: string): Promise<{ matchId: string } | null> {
  const { data, error } = await createAdminClient()
    .from('match_files')
    .select('match_id')
    .eq('sha256', sha256)
    .limit(1)
    .maybeSingle()

  if (error || !data) return null
  return { matchId: data.match_id as string }
}
