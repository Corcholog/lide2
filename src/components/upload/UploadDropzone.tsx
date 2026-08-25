'use client'

import { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const MAX_BYTES = 50 * 1024 * 1024
/** Dos en paralelo: son archivos de 12-17 MB, más no acelera nada. */
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
  pending: 'text-ink-400',
  hashing: 'text-ink-300',
  uploading: 'text-ink-300',
  parsing: 'text-ink-300',
  done: 'text-brand-aqua',
  duplicate: 'text-ink-300',
  error: 'text-brand-red-soft',
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
  const [stageLabel, setStageLabel] = useState('Suizo')
  const [roundLabel, setRoundLabel] = useState('')

  const update = useCallback((id: string, patch: Partial<Item>) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }, [])

  const processOne = useCallback(
    async (item: Item, labels: { stageLabel: string; roundLabel: string }) => {
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
            stageLabel: labels.stageLabel || null,
            roundLabel: labels.roundLabel || null,
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
      const labels = { stageLabel, roundLabel }
      const queue = [...accepted]

      // Un archivo por request: si uno falla, el resto del lote sigue.
      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
          for (let next = queue.shift(); next; next = queue.shift()) {
            await processOne(next, labels)
          }
        }),
      )

      setBusy(false)
      router.refresh()
    },
    [processOne, roundLabel, router, stageLabel],
  )

  const done = items.filter((i) => i.status === 'done').length
  const failed = items.filter((i) => i.status === 'error').length
  const duplicated = items.filter((i) => i.status === 'duplicate').length

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="text-sm text-ink-400">Etapa</span>
          <input
            value={stageLabel}
            onChange={(e) => setStageLabel(e.target.value)}
            placeholder="Suizo"
            className="rounded border border-ink-700 bg-ink-900 px-3 py-2 text-sm outline-none focus:border-brand-aqua"
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-sm text-ink-400">Ronda</span>
          <input
            value={roundLabel}
            onChange={(e) => setRoundLabel(e.target.value)}
            placeholder="Ronda 3"
            className="rounded border border-ink-700 bg-ink-900 px-3 py-2 text-sm outline-none focus:border-brand-aqua"
          />
        </label>
      </div>

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
          dragging ? 'border-brand-aqua bg-brand-aqua-dim/30' : 'border-ink-700 hover:border-ink-600'
        }`}
      >
        <p className="text-lg font-medium">Arrastrá los .rofl acá</p>
        <p className="text-sm text-ink-400">
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
          <div className="flex gap-4 text-sm text-ink-400">
            <span>
              <strong className="text-brand-aqua">{done}</strong> guardadas
            </span>
            {duplicated > 0 && <span>{duplicated} duplicadas</span>}
            {failed > 0 && (
              <span className="text-brand-red-soft">
                <strong>{failed}</strong> con error
              </span>
            )}
            {busy && <span>procesando…</span>}
          </div>

          <ul className="divide-y divide-ink-800 rounded-lg border border-ink-800">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-4 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{item.file.name}</p>
                  {item.message && <p className="truncate text-xs text-ink-400">{item.message}</p>}
                </div>
                <span className="tabular shrink-0 text-xs text-ink-500">
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
