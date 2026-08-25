import { normalizeMatch, parseRofl, RoflParseError } from '../rofl'
import { getStorage } from '../storage'
import { createAdminClient } from '../supabase/admin'
import { buildIngestPayload } from './payload'

export interface IngestRequest {
  /** Ruta del objeto ya subido al storage. */
  storagePath: string
  /** Nombre original del archivo: de ahi sale el match id cuando no lo renombraron. */
  fileName: string
  fileSize: number
  /** lastModified del archivo: la mejor estimacion de cuando se jugo. */
  lastModified?: number | null
  sha256?: string | null
  stageLabel?: string | null
  roundLabel?: string | null
  tournamentId?: string | null
  userId?: string | null
}

export type IngestResult =
  | {
      ok: true
      fileName: string
      status: 'created' | 'duplicate'
      matchId: string
      patch: string | null
      players: number
    }
  | { ok: false; fileName: string; code: string; message: string }

/**
 * Parsea un replay ya subido al storage y lo guarda.
 *
 * Se procesa un archivo por request a proposito: si uno falla, los demas del
 * lote siguen su curso y el error queda acotado a esa fila de la UI.
 */
export async function ingestReplay(request: IngestRequest): Promise<IngestResult> {
  const { fileName, storagePath } = request

  try {
    const storage = await getStorage()

    // El tamano se lee del storage y no del cliente: el parser calcula offsets
    // desde el final del archivo y un numero mal informado lo manda a leer
    // cualquier cosa.
    const stat = await storage.stat(storagePath)
    const size = stat?.size ?? request.fileSize

    const source = await storage.createReadSource(storagePath, size)
    const metadata = await parseRofl(source)
    await source.close?.()

    const match = normalizeMatch(metadata, {
      fileName,
      playedAt: request.lastModified ? new Date(request.lastModified) : null,
    })

    const payload = buildIngestPayload(match, {
      tournamentId: request.tournamentId ?? null,
      stageLabel: request.stageLabel ?? null,
      roundLabel: request.roundLabel ?? null,
      createdBy: request.userId ?? null,
      file: {
        storage_provider: storage.provider,
        storage_path: storagePath,
        file_name: fileName,
        file_size: size,
        sha256: request.sha256 ?? null,
        uploaded_by: request.userId ?? null,
      },
    })

    const supabase = createAdminClient()
    const { data, error } = await supabase.rpc('ingest_match', { payload })

    if (error) {
      return await recordFailure(request, 'DB_ERROR', error.message)
    }

    const result = data as { status: 'created' | 'duplicate'; match_id: string }

    return {
      ok: true,
      fileName,
      status: result.status,
      matchId: result.match_id,
      patch: match.patch,
      players: match.players.length,
    }
  } catch (error) {
    if (error instanceof RoflParseError) {
      return await recordFailure(request, error.code, error.message, error.details)
    }

    const message = error instanceof Error ? error.message : 'Error desconocido'
    return await recordFailure(request, 'UNEXPECTED', message)
  }
}

/**
 * El archivo queda en el storage aunque el parseo falle: es la prueba del
 * resultado, y ademas permite reintentar sin pedirselo de nuevo al equipo.
 */
async function recordFailure(
  request: IngestRequest,
  code: string,
  message: string,
  details?: unknown,
): Promise<IngestResult> {
  try {
    await createAdminClient()
      .from('ingest_failures')
      .insert({
        file_name: request.fileName,
        storage_path: request.storagePath,
        error_code: code,
        error_message: message,
        details: details ? JSON.parse(JSON.stringify(details)) : null,
        created_by: request.userId ?? null,
      })
  } catch {
    // Que no se pueda registrar el fallo no debe tapar el fallo original.
  }

  return { ok: false, fileName: request.fileName, code, message }
}
