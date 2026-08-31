import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Guardar el draft de una partida.
 *
 * El .rofl no trae los baneos —guarda el scoreboard del final, no el draft—,
 * así que la única fuente posible es alguien mirando la transmisión o el
 * historial del cliente. Sin esto, `champion_meta` no puede calcular ban rate
 * ni presencia y las columnas quedan en blanco.
 */

export interface SaveBansResult {
  ok: boolean
  error?: string
  /** Cuántos quedaron guardados. Puede ser menos de diez: se puede pasar un ban. */
  bans?: number
}

/** Un baneo tal cual se manda a la base: la clave interna, no el nombre visible. */
export interface BanInput {
  side: 100 | 200
  orderIndex: number
  champion: string
}

/**
 * Reemplaza el draft entero de una partida.
 *
 * Todo el trabajo lo hace `set_match_bans()`: valida, normaliza la grafía del
 * campeón contra lo que ya tiene la base, y borra e inserta en una sola
 * llamada. Ver `supabase/migrations/0021_meta_y_bans.sql`.
 */
export async function setMatchBans(
  matchId: string,
  bans: BanInput[],
  createdBy: string | null,
): Promise<SaveBansResult> {
  const { data, error } = await createAdminClient().rpc('set_match_bans', {
    p_match_id: matchId,
    p_bans: bans.map((ban) => ({
      side: ban.side,
      order_index: ban.orderIndex,
      champion: ban.champion,
    })),
    p_created_by: createdBy,
  })

  if (error) return { ok: false, error: error.message }
  return data as SaveBansResult
}
