import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Saving a match's draft.
 *
 * The .rofl does not carry the bans - it stores the final scoreboard, not the
 * draft - so the only possible source is somebody watching the broadcast or the
 * client's match history. Without this, `champion_meta` cannot compute ban rate
 * or presence and the columns stay blank.
 */

export interface SaveBansResult {
  ok: boolean
  error?: string
  /** How many were saved. It can be fewer than ten: a ban may be skipped. */
  bans?: number
}

/** One ban exactly as it is sent to the database: the internal key, not the display name. */
export interface BanInput {
  side: 100 | 200
  orderIndex: number
  champion: string
}

/**
 * Replaces a match's entire draft.
 *
 * `set_match_bans()` does all the work: it validates, normalizes the champion
 * spelling against what the database already holds, and deletes and inserts in
 * a single call. See `supabase/migrations/0021_meta_y_bans.sql`.
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
