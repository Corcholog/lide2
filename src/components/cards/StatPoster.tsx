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

/*
 * WHAT SITS BETWEEN THE ARTWORK AND THE TEXT.
 *
 * The piece now carries the hero's painting behind it - see `poster-bg.ts` for
 * the crop - and a poster is not a hero: there the text lives on the washed
 * left and the picture keeps the right, while here the title, five rows and a
 * footnote cover the whole 1080. So the painting can only ever be a texture,
 * and this is what turns it into one.
 *
 * HEAVIEST AT THE TOP, which is the opposite of what a backdrop usually wants.
 * The artwork's sky is nearly white and the title is 96px of Archivo Black over
 * it: unwashed, that is 96px of nothing. Downwards the painting darkens on its
 * own - it is black armour from the chest down - so the wash can ease off, and
 * it closes again at the foot where the smallest text of the piece is.
 *
 * THESE ARE THE NUMBERS TO TURN. More painting: drop them. More text: raise
 * them. The one with the least room is the first, because it is the one over
 * the sky: the greys of a row's second line stop holding against white long
 * before they stop holding against the armour further down.
 */
const BACKDROP = [
  // Vignette, the same idea as the hero's: closes the corners so the piece
  // ends in the tournament's black and not in a torn photo.
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
 * WHAT KEEPS THE SMALL TEXT ON TOP OF THE PAINTING.
 *
 * The white holds by itself; the greys did not. "434:31 de juego" landing on
 * the artwork's pale hair is grey on grey, and the reason is not the wash being
 * too light: it is that the tokens under `fg-soft` were tuned to sit on a solid
 * canvas, where `faint` and `dim` are a legible bottom step. Over a painting
 * they are a smudge, and no amount of shadow saves a colour that close to what
 * is behind it.
 *
 * So the piece uses TWO greys and not four: `fg` for what is being read - the
 * title, the names - and `fg-soft` for everything that qualifies it. What
 * separates the tiers here is size and weight, which a poster has plenty of:
 * 96px against 28px says more about hierarchy than two shades of the same grey
 * ever did.
 *
 * And every one of them carries this halo. Stacked shadows and not one: a
 * single soft shadow moves the problem a few pixels, while four of increasing
 * radius build a small dark ground that travels with the glyph, which is what
 * makes a grey readable over a texture rather than merely over a colour. It is
 * inherited from the content's wrapper, so nothing has to remember it.
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
            {/*
              The artwork. It is the file cut for this - 1080 x 1920, the taller
              of the two formats - so the story uses it whole and the post takes
              the same thing anchored at the top, losing the bottom. No
              `crossOrigin`: it comes from this same origin, which is also what
              lets html-to-image inline it without tainting the canvas.
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
                {/* Bold: it is the only red on the piece until the first place
                    below, and at 28px in a wide tracking the accent was reading
                    as a grey that happened to be warm. */}
                <span className="text-[28px] font-bold uppercase tracking-[0.18em] text-accent">
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
        The logos are not uploaded to the bucket yet, so today this never draws.
        It stays in so they appear on their own once they are. crossOrigin:
        without it the canvas is tainted and the export fails.
      */}
      {row.logo && (
        <img
          src={row.logo}
          alt=""
          crossOrigin="anonymous"
          // 96 and not 72: in "Los más elegidos" this is the champion's
          // portrait, and the portrait IS what that ranking is about - at 72 it
          // sat below the name beside it and read as a bullet point. It clears
          // the two lines of the row (a 50px name over a 28px line), so nothing
          // grows to make room for it.
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
