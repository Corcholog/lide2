'use client'

import { useRef, useState } from 'react'
import { toCsv, toPlainText } from '@/lib/cards/export'
import { FORMATS, type Poster, type PosterFormat } from '@/lib/cards/types'
import { StatPoster, exportPoster } from './StatPoster'

/**
 * A matchday's batch: every piece with its raw data beside it.
 *
 * Both halves come out of the same `StatBlock`, and that is the reason they sit
 * together: whoever downloads the PNG and whoever hands the numbers to a
 * designer publish the same thing. If the text and the image could disagree,
 * one of the two versions would go out into the world wrong.
 */
export function PosterBatch({ posters, prefix }: { posters: Poster[]; prefix: string }) {
  const [format, setFormat] = useState<PosterFormat>('post')
  const [busy, setBusy] = useState(false)
  const nodes = useRef(new Map<string, HTMLElement>())

  const spec = FORMATS.find((entry) => entry.id === format) ?? FORMATS[0]

  const fileName = (poster: Poster) => `${prefix}-${poster.id}-${format}.png`

  /**
   * All of them at once, in order.
   *
   * One at a time, awaiting each export: they are eight 1080 x 1350 captures
   * and firing them together blocks the main thread long enough for the browser
   * to declare the tab hung. The browser will ask permission to download
   * several files, which is to be expected.
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
        `pre` and not a table: what shows here is exactly what gets copied, and
        any layout in between opens the door to the two diverging.
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
      // No clipboard permission (http, or the browser blocks it): the text is
      // in plain sight anyway and can be selected by hand.
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
