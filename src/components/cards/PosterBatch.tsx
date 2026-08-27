'use client'

import { useRef, useState } from 'react'
import { toCsv, toPlainText } from '@/lib/cards/export'
import { FORMATS, type Poster, type PosterFormat } from '@/lib/cards/types'
import { StatPoster, exportPoster } from './StatPoster'

/**
 * El lote de una fecha: cada pieza con sus datos crudos al lado.
 *
 * Las dos mitades salen del mismo `StatBlock`, y esa es la razón de que estén
 * juntas: el que baja el PNG y el que le pasa los números a un diseñador
 * publican lo mismo. Si el texto y la imagen pudieran discrepar, alguna de las
 * dos versiones saldría mal a la calle.
 */
export function PosterBatch({ posters, prefix }: { posters: Poster[]; prefix: string }) {
  const [format, setFormat] = useState<PosterFormat>('post')
  const [busy, setBusy] = useState(false)
  const nodes = useRef(new Map<string, HTMLElement>())

  const spec = FORMATS.find((entry) => entry.id === format) ?? FORMATS[0]

  const fileName = (poster: Poster) => `${prefix}-${poster.id}-${format}.png`

  /**
   * Todas de una, en orden.
   *
   * De a una y esperando cada exportación: son ocho capturas de 1080 × 1350 y
   * lanzarlas juntas traba el hilo principal lo suficiente como para que el
   * navegador dé por colgada la pestaña. El navegador va a pedir permiso para
   * bajar varios archivos, que es lo esperable.
   */
  async function downloadAll() {
    setBusy(true)
    try {
      for (const poster of posters) {
        const node = nodes.current.get(poster.id)
        if (node) await exportPoster(node, spec, fileName(poster))
      }
    } finally {
      setBusy(false)
    }
  }

  if (posters.length === 0) return null

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-2 border-line bg-surface px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {FORMATS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setFormat(entry.id)}
              aria-pressed={format === entry.id}
              className={`cursor-pointer border-2 px-3 py-1 text-xs font-bold uppercase tracking-wide transition-colors ${
                format === entry.id
                  ? 'border-accent bg-accent-dim text-accent'
                  : 'border-line text-muted hover:border-line-strong hover:text-accent'
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={downloadAll}
          disabled={busy}
          className="cursor-pointer bg-accent-strong px-4 py-2 text-xs font-bold uppercase tracking-wide text-white transition-colors hover:bg-accent disabled:opacity-50"
        >
          {busy ? 'Generando…' : `Descargar las ${posters.length}`}
        </button>
      </div>

      {posters.map((poster) => (
        <article
          key={poster.id}
          className="flex flex-col gap-6 border-2 border-line bg-surface p-4 lg:flex-row"
        >
          <StatPoster
            block={poster.block}
            kicker={poster.kicker}
            format={spec}
            fileName={fileName(poster)}
            ordered={poster.ordered}
            register={(node) => {
              if (node) nodes.current.set(poster.id, node)
              else nodes.current.delete(poster.id)
            }}
          />

          <RawData block={poster.block} />
        </article>
      ))}
    </div>
  )
}

function RawData({ block }: { block: Poster['block'] }) {
  const text = toPlainText(block)
  const csv = toCsv(block)

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-sm uppercase tracking-wide">{block.title}</h3>
        <div className="flex gap-1">
          <CopyButton label="Copiar texto" value={text} />
          <CopyButton label="Copiar CSV" value={csv} />
        </div>
      </div>

      {/*
        `pre` y no una tabla: lo que se ve acá es exactamente lo que se copia, y
        cualquier maquetado intermedio abre la puerta a que difieran.
      */}
      <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words border border-line bg-canvas px-3 py-2 font-mono text-xs leading-relaxed text-fg-soft">
        {text}
      </pre>
    </div>
  )
}

function CopyButton({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Sin permiso de portapapeles (http, o el navegador lo bloquea): el texto
      // está a la vista igual y se puede seleccionar a mano.
      setCopied(false)
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="cursor-pointer border-2 border-line px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-muted transition-colors hover:border-accent hover:text-accent"
    >
      {copied ? 'Copiado' : label}
    </button>
  )
}
