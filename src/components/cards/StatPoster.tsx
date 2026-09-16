'use client'

/* eslint-disable @next/next/no-img-element */

import { useRef, useState } from 'react'
import { downloadNodeAsPng } from '@/lib/cards/png'
import type { StatBlock } from '@/lib/stats/types'
import type { FormatSpec } from '@/lib/cards/types'

/**
 * A 1080-wide Instagram piece for any `StatBlock`. Content arrives resolved;
 * this only lays it out. Always dark, so exports look the same whatever theme
 * the admin uses.
 */

/** Preview width; the exported piece is always 1080 wide. */
const PREVIEW_WIDTH = 340

/*
 * The red glow of the site's backdrop. Inline styles are exported the same as
 * Tailwind classes, since html-to-image copies computed styles.
 */
const GLOW = [
  'radial-gradient(70% 50% at 88% 0%, color-mix(in srgb, var(--accent) 22%, transparent) 0%, transparent 62%)',
  'radial-gradient(60% 45% at -10% 100%, color-mix(in srgb, var(--color-steel) 26%, transparent) 0%, transparent 60%)',
].join(', ')

/*
 * Overlay between the artwork and the text (the crop comes from
 * `poster-bg.ts`). The text covers the whole piece, so the artwork is only a
 * texture.
 *
 * Heaviest at the top, where the artwork's sky is nearly white under the
 * title; lighter in the middle, where the artwork is dark; heavier again at the
 * bottom for the small footer text. Lower the values to show more artwork,
 * raise them for more legibility.
 */
const BACKDROP = [
  // Vignette, like the hero's, so the corners fade to black.
  'radial-gradient(120% 75% at 50% 24%, transparent 24%, color-mix(in srgb, var(--canvas) 55%, transparent) 100%)',
  // The wash.
  [
    'linear-gradient(to bottom',
    'color-mix(in srgb, var(--canvas) 86%, transparent) 0%',
    'color-mix(in srgb, var(--canvas) 78%, transparent) 38%',
    'color-mix(in srgb, var(--canvas) 84%, transparent) 72%',
    'color-mix(in srgb, var(--canvas) 93%, transparent) 100%)',
  ].join(', '),
].join(', ')

/*
 * Keeps text legible over the artwork.
 *
 * The lower grey tokens (`faint`, `dim`) are tuned for solid backgrounds and
 * become illegible over an image, so pieces only use `fg` and `fg-soft`, with
 * size and weight carrying the hierarchy. Four stacked shadows of increasing
 * radius form a dark ground behind each glyph; it is inherited from the content
 * wrapper.
 */
const HALO = [
  '0 1px 2px color-mix(in srgb, var(--canvas) 92%, transparent)',
  '0 0 6px color-mix(in srgb, var(--canvas) 92%, transparent)',
  '0 0 16px color-mix(in srgb, var(--canvas) 85%, transparent)',
  '0 0 34px color-mix(in srgb, var(--canvas) 70%, transparent)',
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
        The preview is scaled down; the exported node stays 1080 wide. The
        wrapper's height is set so no empty space is left below the thumbnail.
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
            {/*
              The artwork, cropped to 1080 x 1920 (the taller format); the 1350
              post uses it anchored at the top. Same origin, so html-to-image can
              inline it without tainting the canvas.
            */}
            <img
              src="/lide2-poster.jpg"
              alt=""
              aria-hidden
              className="absolute inset-0 size-full object-cover object-top"
            />
            <div className="absolute inset-0" style={{ background: BACKDROP }} aria-hidden />
            <div className="absolute inset-0" style={{ background: GLOW }} aria-hidden />

            <div className="relative flex h-full flex-col" style={{ textShadow: HALO }}>
              <header className="flex items-baseline justify-between">
                <span className="font-display text-[44px] uppercase leading-none tracking-tight">
                  LIDE 2
                </span>
                {/* Bold, so the red kicker reads as red at this size. */}
                <span className="text-[28px] font-bold uppercase tracking-[0.18em] text-accent">
                  {kicker}
                </span>
              </header>

              <div className="mt-[52px]">
                {/*
                  Most titles wrap at this size; `text-balance` splits the lines
                  evenly.
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
                `justify-around` spreads the rows over the remaining height, so
                one layout works for both 1350 and 1920.
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
                <span className="text-[26px] text-fg-soft">LIDE 2 · Red UNCI</span>
                {block.note && (
                  <span className="max-w-[60%] text-right text-[24px] leading-tight text-fg-soft">
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
        Champion icons and university crests. `crossOrigin` keeps the canvas
        untainted for the export.
      */}
      {row.logo && (
        <img
          src={row.logo}
          alt=""
          crossOrigin="anonymous"
          // 96px: in champion rankings the portrait is the subject, and it still
          // fits within the row's two text lines.
          className="size-[96px] shrink-0 object-contain"
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
          <p className="mt-[6px] truncate text-[28px] leading-tight text-fg-soft">
            {[row.subtitle, row.detail].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>

      {/*
        Capped and truncated: some values are long ("5.9k de oro") and would
        overlap the name.
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

/** Exports the poster as a PNG (see `downloadNodeAsPng`). */
export function exportPoster(node: HTMLElement, format: FormatSpec, fileName: string) {
  return downloadNodeAsPng(node, format, fileName)
}
