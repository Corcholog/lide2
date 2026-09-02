import { normalizeMatch, parseRofl, RoflParseError } from '../rofl'
import { getStorage } from '../storage'
import { createAdminClient } from '../supabase/admin'
import { buildIngestPayload } from './payload'

export interface IngestRequest {
  /** Path of the object already uploaded to storage. */
  storagePath: string
  /** The file's original name: the match id comes from it when it was not renamed. */
  fileName: string
  fileSize: number
  /** The file's lastModified: the best guess at when it was played. */
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
 * Parses a replay already uploaded to storage and saves it.
 *
 * One file per request on purpose: when one fails, the rest of the batch runs
 * its course and the error stays confined to that row of the UI.
 */
export async function ingestReplay(request: IngestRequest): Promise<IngestResult> {
  const { fileName, storagePath } = request

  try {
    const storage = await getStorage()

    // The size is read from storage and not from the client: the parser
    // computes offsets from the end of the file, and a misreported number sends
    // it off to read anything at all.
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

    const message = error instanceof Error ? error.message : 'Error desconocido'  // texto de UI
    return await recordFailure(request, 'UNEXPECTED', message)
  }
}

/**
 * The file stays in storage even when parsing fails: it is the proof of the
 * result, and it also allows a retry without asking the team for it again.
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
    // Failing to record the failure must not bury the original one.
  }

  return { ok: false, fileName: request.fileName, code, message }
}
