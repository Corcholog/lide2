import { createAdminClient } from '../supabase/admin'

/**
 * Finds a stored file with the same bytes (same sha256), to skip uploading the
 * same file twice. Separate from the match fingerprint, which matches the two
 * different .rofl files each team's client records for one game.
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
