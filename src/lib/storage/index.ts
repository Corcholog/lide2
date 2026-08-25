import type { RoflSource } from '../rofl'

/**
 * Capa de storage detras de una interfaz chica.
 *
 * Los .rofl pesan 12-17 MB y el torneo suizo de 20 equipos son ~65 partidas
 * (~920 MB), justo en el limite del plan free de Supabase. Cuando haya que
 * mudarlos a Cloudflare R2 alcanza con escribir otro adaptador con esta misma
 * interfaz: el resto de la app no se entera.
 */

export interface UploadTarget {
  provider: string
  /** Ruta dentro del bucket. Es lo que se guarda en match_files.storage_path. */
  path: string
  /** El cliente lo necesita para subir; se manda desde el server y no como env publica. */
  bucket: string
  /** URL a la que el browser sube directo, sin pasar por Vercel. */
  uploadUrl: string
  /** Token de la signed upload URL (especifico de Supabase). */
  token: string
}

export interface StorageAdapter {
  readonly provider: string
  /** Reserva una ruta y devuelve permiso de subida por unica vez. */
  createUploadTarget(originalName: string): Promise<UploadTarget>
  /** Tamano real del objeto ya subido. No se confia en el numero del cliente. */
  stat(path: string): Promise<{ size: number } | null>
  /**
   * Lector por rangos: el parser solo necesita el header (288 bytes) y el
   * bloque final con la metadata, ~118 KB de un archivo de 15 MB.
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
