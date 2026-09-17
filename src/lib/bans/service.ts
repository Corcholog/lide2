import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Saves a match's draft. The .rofl has no bans, so they are entered by hand;
 * without them `champion_meta` cannot compute ban rate or presence.
 */

export interface SaveBansResult {
  ok: boolean
  error?: string
  /** How many were saved; fewer than ten if a ban was skipped. */
  bans?: number
}

/** One ban as sent to the database, with the internal champion key. */
export interface BanInput {
  side: 100 | 200
  orderIndex: number
  champion: string
}

/**
 * Replaces a match's whole draft. `set_match_bans()` validates, normalizes the
 * champion spelling and replaces the rows in one call. See
 * `supabase/migrations/0021_meta_y_bans.sql`.
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
