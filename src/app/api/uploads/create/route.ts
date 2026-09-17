import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { MAX_REPLAY_BYTES } from '@/lib/env'
import { getStorage } from '@/lib/storage'
import { findFileBySha256 } from '@/lib/ingest/duplicates'

export const runtime = 'nodejs'

/**
 * Reserves a storage path and returns a signed upload URL. The file itself is
 * uploaded directly from the browser: Vercel limits request bodies to 4.5 MB
 * and replays are 12-17 MB.
 */
export async function POST(request: Request) {
  const user = await requireApiUser()
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as {
    fileName?: string
    fileSize?: number
    sha256?: string
  } | null

  const fileName = String(body?.fileName ?? '')
  const fileSize = Number(body?.fileSize ?? 0)

  if (!fileName.toLowerCase().endsWith('.rofl')) {
    return NextResponse.json({ error: 'El archivo tiene que ser un .rofl' }, { status: 400 })
  }

  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    return NextResponse.json({ error: 'Tamaño de archivo inválido' }, { status: 400 })
  }

  if (fileSize > MAX_REPLAY_BYTES) {
    return NextResponse.json(
      { error: `El archivo supera el límite de ${Math.round(MAX_REPLAY_BYTES / 1024 / 1024)} MB` },
      { status: 400 },
    )
  }

  // Skip the upload when the same bytes (same sha256) are already stored.
  if (body?.sha256) {
    const existing = await findFileBySha256(body.sha256)
    if (existing) {
      return NextResponse.json({ duplicate: true, matchId: existing.matchId })
    }
  }

  const storage = await getStorage()
  const target = await storage.createUploadTarget(fileName)

  return NextResponse.json(target)
}
