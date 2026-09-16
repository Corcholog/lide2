import type { RoflSource } from '../rofl'

/**
 * Storage behind a small interface, so another provider (e.g. Cloudflare R2)
 * can be added as an adapter without touching the rest of the app. Replays are
 * 12-17 MB each, which adds up quickly on the Supabase free plan.
 */

export interface UploadTarget {
  provider: string
  /** Path inside the bucket. It is what match_files.storage_path stores. */
  path: string
  /** Sent to the client by the server rather than exposed as a public env var. */
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
