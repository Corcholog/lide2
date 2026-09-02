import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { ingestReplay } from '@/lib/ingest/ingest'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Parses an already-uploaded replay and saves it. One file per request: that
 * way a corrupt .rofl does not drag the rest of the batch down.
 */
export async function POST(request: Request) {
  const user = await requireApiUser()
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as {
    storagePath?: string
    fileName?: string
    fileSize?: number
    lastModified?: number
    sha256?: string
    stageLabel?: string
    roundLabel?: string
  } | null

  if (!body?.storagePath || !body?.fileName) {
    return NextResponse.json({ error: 'Faltan datos del archivo' }, { status: 400 })
  }

  const result = await ingestReplay({
    storagePath: body.storagePath,
    fileName: body.fileName,
    fileSize: Number(body.fileSize ?? 0),
    lastModified: body.lastModified ?? null,
    sha256: body.sha256 ?? null,
    stageLabel: body.stageLabel ?? null,
    roundLabel: body.roundLabel ?? null,
    userId: user.id,
  })

  return NextResponse.json(result, { status: result.ok ? 200 : 422 })
}
