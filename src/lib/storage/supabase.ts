import { randomUUID } from 'node:crypto'
import { REPLAYS_BUCKET } from '../env'
import { rangeUrlSource, type RoflSource } from '../rofl'
import { createAdminClient } from '../supabase/admin'
import type { StorageAdapter, UploadTarget } from './index'

/**
 * Los nombres reales vienen con espacios y acentos ("Fecha 3 Equipo 2 vs
 * Equipo 9.rofl"), asi que el objeto se guarda con un uuid y el nombre original
 * queda en la base (match_files.file_name).
 */
function objectPath(): string {
  const now = new Date()
  const folder = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
  return `${folder}/${randomUUID()}.rofl`
}

export function createSupabaseStorage(): StorageAdapter {
  const bucket = () => createAdminClient().storage.from(REPLAYS_BUCKET)

  return {
    provider: 'supabase',

    async createUploadTarget(): Promise<UploadTarget> {
      const path = objectPath()
      const { data, error } = await bucket().createSignedUploadUrl(path)

      if (error || !data) {
        throw new Error(`No se pudo preparar la subida: ${error?.message ?? 'sin datos'}`)
      }

      return {
        provider: 'supabase',
        bucket: REPLAYS_BUCKET,
        path: data.path,
        uploadUrl: data.signedUrl,
        token: data.token,
      }
    },

    async stat(path) {
      const slash = path.lastIndexOf('/')
      const folder = slash === -1 ? '' : path.slice(0, slash)
      const name = slash === -1 ? path : path.slice(slash + 1)

      const { data, error } = await bucket().list(folder, { search: name, limit: 1 })
      if (error) throw new Error(`No se pudo leer el objeto: ${error.message}`)

      const found = data?.find((item) => item.name === name)
      const size = found?.metadata?.size
      return typeof size === 'number' ? { size } : null
    },

    async createReadSource(path, size): Promise<RoflSource> {
      // Una sola signed URL para los 3 requests Range del parser.
      const { data, error } = await bucket().createSignedUrl(path, 120)
      if (error || !data) {
        throw new Error(`No se pudo abrir el replay: ${error?.message ?? 'sin datos'}`)
      }
      return rangeUrlSource(data.signedUrl, size)
    },

    async createDownloadUrl(path, expiresInSeconds = 300) {
      const { data, error } = await bucket().createSignedUrl(path, expiresInSeconds, {
        download: true,
      })
      if (error || !data) {
        throw new Error(`No se pudo generar el link de descarga: ${error?.message ?? 'sin datos'}`)
      }
      return data.signedUrl
    },

    async remove(path) {
      const { error } = await bucket().remove([path])
      if (error) throw new Error(`No se pudo borrar el archivo: ${error.message}`)
    },
  }
}
