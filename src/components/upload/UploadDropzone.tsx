'use client'

import { useCallback, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const MAX_BYTES = 50 * 1024 * 1024
/** Two in parallel: they are 12-17 MB files, more speeds nothing up. */
const CONCURRENCY = 2

type Status = 'pending' | 'hashing' | 'uploading' | 'parsing' | 'done' | 'duplicate' | 'error'

interface Item {
  id: string
  file: File
  status: Status
  message?: string
  matchId?: string
}

const LABELS: Record<Status, string> = {
  pending: 'en cola',
  hashing: 'calculando huella',
  uploading: 'subiendo',
  parsing: 'parseando',
  done: 'guardada',
  duplicate: 'duplicada',
  error: 'error',
}

const TONE: Record<Status, string> = {
  pending: 'text-muted',
  hashing: 'text-fg-soft',
  uploading: 'text-fg-soft',
  parsing: 'text-fg-soft',
  done: 'text-ok',
  duplicate: 'text-fg-soft',
  error: 'text-danger',
}

function formatSize(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

async function sha256(file: File): Promise<string | null> {
  if (!globalThis.crypto?.subtle) return null
  try {
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  } catch {
    return null
  }
}

export function UploadDropzone() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [items, setItems] = useState<Item[]>([])
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)

  const update = useCallback((id: string, patch: Partial<Item>) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }, [])

  const processOne = useCallback(
    async (item: Item) => {
      const { file } = item

      try {
        update(item.id, { status: 'hashing' })
        const digest = await sha256(file)

        update(item.id, { status: 'uploading' })
        const targetRes = await fetch('/api/uploads/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: file.name, fileSize: file.size, sha256: digest }),
        })

        if (!targetRes.ok) {
          const body = await targetRes.json().catch(() => ({}))
          throw new Error(body.error ?? 'No se pudo preparar la subida')
        }

        const target = (await targetRes.json()) as {
          duplicate?: boolean
          matchId?: string
          bucket: string
          path: string
          token: string
        }

        if (target.duplicate) {
          update(item.id, {
            status: 'duplicate',
            matchId: target.matchId,
            message: 'este mismo archivo ya estaba cargado',
          })
          return
        }

        const supabase = createClient()
        const { error: uploadError } = await supabase.storage
          .from(target.bucket)
          .uploadToSignedUrl(target.path, target.token, file)

        if (uploadError) throw new Error(uploadError.message)

        update(item.id, { status: 'parsing' })
        const ingestRes = await fetch('/api/matches/ingest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storagePath: target.path,
            fileName: file.name,
            fileSize: file.size,
            lastModified: file.lastModified,
            sha256: digest,
          }),
        })

        const result = await ingestRes.json()

        if (!result.ok) {
          update(item.id, { status: 'error', message: result.message ?? result.error })
          return
        }

        update(item.id, {
          status: result.status === 'duplicate' ? 'duplicate' : 'done',
          matchId: result.matchId,
          message:
            result.status === 'duplicate'
              ? 'ya estaba cargada; el archivo queda como prueba adicional'
              : `parche ${result.patch ?? '?'}`,
        })
      } catch (error) {
        update(item.id, {
          status: 'error',
          message: error instanceof Error ? error.message : 'Error desconocido',
        })
      }
    },
    [update],
  )

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const accepted: Item[] = []
      const rejected: Item[] = []

      for (const file of Array.from(files)) {
        const item: Item = {
          id: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
          file,
          status: 'pending',
        }

        if (!file.name.toLowerCase().endsWith('.rofl')) {
          rejected.push({ ...item, status: 'error', message: 'No es un archivo .rofl' })
        } else if (file.size > MAX_BYTES) {
          rejected.push({ ...item, status: 'error', message: 'Supera los 50 MB' })
        } else {
          accepted.push(item)
        }
      }

      setItems((current) => [...current, ...accepted, ...rejected])
      if (accepted.length === 0) return

      setBusy(true)
      const queue = [...accepted]

      // One file per request: when one fails, the rest of the batch goes on.
      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
          for (let next = queue.shift(); next; next = queue.shift()) {
            await processOne(next)
          }
        }),
      )

      setBusy(false)
      router.refresh()
    },
    [processOne, router],
  )

  const done = items.filter((i) => i.status === 'done').length
  const failed = items.filter((i) => i.status === 'error').length
  const duplicated = items.filter((i) => i.status === 'duplicate').length

  return (
    <div className="flex flex-col gap-6">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          void addFiles(e.dataTransfer.files)
        }}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-14 text-center transition-colors ${
          dragging ? 'border-accent bg-accent-dim/50' : 'border-line-strong hover:border-accent'
        }`}
      >
        <p className="text-lg font-medium">Arrastrá los .rofl acá</p>
        <p className="text-sm text-muted">
          o hacé clic para elegirlos. Se pueden subir varios a la vez, hasta 50 MB cada uno.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".rofl"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void addFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {items.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-4 text-sm text-muted">
            <span>
              <strong className="text-ok">{done}</strong> guardadas
            </span>
            {duplicated > 0 && <span>{duplicated} duplicadas</span>}
            {failed > 0 && (
              <span className="text-danger">
                <strong>{failed}</strong> con error
              </span>
            )}
            {busy && <span>procesando…</span>}
          </div>

          {/*
            Subir no alcanza: hasta que no se diga de qué cruce es cada replay,
            la partida no tiene equipos ni fecha y no aparece en ningún lado.
          */}
          {!busy && done > 0 && (
            <Link
              href="/admin/asignar"
              className="self-start border-2 border-accent bg-accent-dim px-3 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent-strong hover:text-white"
            >
              Asignarlas al fixture →
            </Link>
          )}

          <ul className="divide-y divide-line rounded-lg border border-line">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-4 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{item.file.name}</p>
                  {item.message && <p className="truncate text-xs text-muted">{item.message}</p>}
                </div>
                <span className="tabular shrink-0 text-xs text-faint">
                  {formatSize(item.file.size)}
                </span>
                <span className={`shrink-0 text-xs font-medium ${TONE[item.status]}`}>
                  {LABELS[item.status]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
