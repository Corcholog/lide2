import type { RoflSource } from '../rofl'

/**
 * The storage layer behind a small interface.
 *
 * The .rofl files weigh 12-17 MB and the 20-team Swiss tournament is ~65
 * matches (~920 MB), right at the limit of the Supabase free plan. When they
 * have to move to Cloudflare R2, writing another adapter against this same
 * interface is enough: the rest of the app never finds out.
 */

export interface UploadTarget {
  provider: string
  /** Path inside the bucket. It is what match_files.storage_path stores. */
  path: string
  /** The client needs it to upload; it is sent from the server, not as a public env var. */
  bucket: string
  /** URL the browser uploads straight to, without going through Vercel. */
  uploadUrl: string
  /** Token of the signed upload URL (Supabase-specific). */
  token: string
}

export interface StorageAdapter {
  readonly provider: string
  /** Reserves a path and hands back one-time permission to upload. */
  createUploadTarget(originalName: string): Promise<UploadTarget>
  /** The uploaded object's real size. The client's number is not trusted. */
  stat(path: string): Promise<{ size: number } | null>
  /**
   * Range reader: the parser only needs the header (288 bytes) and the final
   * metadata block, ~118 KB out of a 15 MB file.
   */
  createReadSource(path: string, size: number): Promise<RoflSource>
  createDownloadUrl(path: string, expiresInSeconds?: number): Promise<string>
  remove(path: string): Promise<void>
}

let cached: StorageAdapter | null = null

export async function getStorage(): Promise<StorageAdapter> {
  if (!cached) {
    const { createSupabaseStorage } = await import('./supabase')
    cached = createSupabaseStorage()
  }
  return cached
}
