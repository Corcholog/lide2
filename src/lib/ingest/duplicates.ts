import { createAdminClient } from '../supabase/admin'

/**
 * Looks for an already-stored file with exactly the same bytes.
 *
 * This is different from deduplication by match fingerprint: here what gets
 * caught is the same file uploaded twice (same sha256), and it saves the upload
 * before the quota is spent. The fingerprint, in contrast, joins the two
 * different .rofl files the clients of the two teams record for one match.
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
