'use client'

/* eslint-disable @next/next/no-img-element */

import { useRef, useState } from 'react'
import { downloadNodeAsPng } from '@/lib/cards/png'
import type { StatBlock } from '@/lib/stats/types'
import type { FormatSpec } from '@/lib/cards/types'

/**
 * A piece 1080 wide, ready to publish.
 *
 * It draws any `StatBlock`, so it serves the registry's 34 stats and the two
 * that are built separately. It decides nothing about content: the title, the
 * rows and the caveat all arrive resolved.
 *
 * The piece always comes out dark, even when the site is in the light theme. It
 * is an image going up on Instagram: it has to come out the same whoever
 * exports it.
 */

/** Preview width. The real piece always measures 1080. */
const PREVIEW_WIDTH = 340

/*
 * The usual red glow, the same one as the site's backdrop. It goes in an inline
 * style and not in a class because html-to-image clones computed styles: a
 * gradient written here travels just like a Tailwind one, and this way it reads
 * next to the numbers that use it.
 */
const GLOW = [
  'radial-gradient(70% 50% at 88% 0%, color-mix(in srgb, var(--accent) 22%, transparent) 0%, transparent 62%)',
  'radial-gradient(60% 45% at -10% 100%, color-mix(in srgb, var(--color-steel) 26%, transparent) 0%, transparent 60%)',
].join(', ')

export function StatPoster({
  block,
  kicker,
  format,
  fileName,
  ordered,
  register,
}: {
  block: StatBlock
  kicker: string
  format: FormatSpec
  fileName: string
  /** Whether the rows are numbered. See `Poster.ordered`. */
  ordered: boolean
  /** Hands the node to the batch, so all of them can be downloaded at once. */
  register?: (node: HTMLElement | null) => void
}) {
  const card = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function download() {
    if (!card.current) return
    setBusy(true)
    setError(null)

    try {
      await exportPoster(card.current, format, fileName)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar la imagen')
    } finally {
      setBusy(false)
    }
  }

  const scale = PREVIEW_WIDTH / format.width

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-faint">
          {format.width} × {format.height}
        </p>
        <button
          type="button"
          onClick={download}
          disabled={busy}
          className="cursor-pointer border-2 border-accent px-3 py-1 text-xs font-bold uppercase tracking-wide text-accent transition-colors hover:bg-accent-dim disabled:opacity-50"
        >
          {busy ? 'Generando…' : 'Descargar PNG'}
        </button>
      </div>

      {error && (
        <p className="border-2 border-danger/40 bg-danger-dim px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}

      {/*
        The container shrinks the view; the exported node keeps its 1080. The
        slot's height is computed, otherwise the whole piece's worth of space is
        left below the thumbnail.
      */}
      <div
        className="overflow-hidden border-2 border-line"
        style={{ width: PREVIEW_WIDTH, height: format.height * scale }}
      >
        <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          <div
            ref={(node) => {
              card.current = node
              register?.(node)
            }}
            data-theme="dark"
            style={{ width: format.width, height: format.height }}
            className="relative flex flex-col overflow-hidden bg-canvas px-[72px] py-[64px] text-fg"
          >
            <div className="absolute inset-0" style={{ background: GLOW }} aria-hidden />

            <div className="relative flex h-full flex-col">
              <header className="flex items-baseline justify-between">
                <span className="font-display text-[44px] uppercase leading-none tracking-tight">
                  LIDE
                </span>
                <span className="text-[28px] uppercase tracking-[0.18em] text-accent">
                  {kicker}
                </span>
              </header>

              <div className="mt-[52px]">
                {/*
                  The titles run from "MVP" to "Tabla de universidades", so at
                  this size nearly all of them break onto two lines.
                  `text-balance` splits them evenly instead of leaving one word
                  stranded below.
                */}
                <h1 className="font-display text-balance text-[96px] uppercase leading-[0.85] tracking-[-0.04em]">
                  {block.title}
                </h1>
                {block.subtitle && (
                  <p className="mt-[18px] text-[34px] leading-tight text-fg-soft">
                    {block.subtitle}
                  </p>
                )}
              </div>

              {/*
                `justify-around` spreads the rows across whatever height is left
                over, so the same piece composes well at 1350 and at 1920
                without two layouts.
              */}
              <ol className="flex flex-1 flex-col justify-around py-[36px]">
                {block.rows.map((row, index) => (
                  <Row
                    key={row.id}
                    row={row}
                    position={ordered ? index + 1 : null}
                    lead={ordered && index === 0}
                  />
                ))}
              </ol>

              <footer className="flex items-end justify-between border-t-2 border-line pt-[24px]">
                <span className="text-[26px] text-dim">LIDE 2 · Red UNCI</span>
                {block.note && (
                  <span className="max-w-[60%] text-right text-[24px] leading-tight text-faint">
                    {block.note}
                  </span>
                )}
              </footer>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({
  row,
  position,
  lead,
}: {
  row: StatBlock['rows'][number]
  /** null when the rows are not a ranking: it carries no number. */
  position: number | null
  lead: boolean
}) {
  return (
    <li className="flex items-center gap-[28px]">
      {position !== null && (
        <span
          className={`w-[62px] shrink-0 font-display text-[52px] leading-none ${
            lead ? 'text-accent' : 'text-dim'
          }`}
        >
          {position}
        </span>
      )}

      {/*
        The logos are not uploaded to the bucket yet, so today this never draws.
        It stays in so they appear on their own once they are. crossOrigin:
        without it the canvas is tainted and the export fails.
      */}
      {row.logo && (
        <img
          src={row.logo}
          alt=""
          crossOrigin="anonymous"
          className="size-[72px] shrink-0 object-contain"
        />
      )}

      <div className="min-w-0 flex-1">
        <p
          className={`truncate leading-tight ${
            lead ? 'text-[62px] font-bold' : 'text-[50px] font-medium'
          }`}
        >
          {row.name}
        </p>
        {(row.subtitle || row.detail) && (
          <p className="mt-[6px] truncate text-[28px] leading-tight text-faint">
            {[row.subtitle, row.detail].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>

      {/*
        `max-w-[46%]` and truncate: the value is not always a short number. "5.9k
        de oro" at this size eats half the piece, and with no cap it runs over
        the name beside it, which is what people came to read.
      */}
      <span
        className={`max-w-[46%] shrink-0 truncate text-right tabular-nums ${
          lead ? 'text-[56px] font-bold text-accent' : 'text-[42px] text-fg-soft'
        }`}
      >
        {row.display}
      </span>
    </li>
  )
}

/**
 * The poster as a PNG. The capture itself lives in `downloadNodeAsPng`, which
 * the match card shares.
 */
export function exportPoster(node: HTMLElement, format: FormatSpec, fileName: string) {
  return downloadNodeAsPng(node, format, fileName)
}
