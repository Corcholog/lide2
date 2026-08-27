'use client'

/* eslint-disable @next/next/no-img-element */

import { useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import type { StatBlock } from '@/lib/stats/types'
import type { FormatSpec } from '@/lib/cards/types'

/**
 * Una pieza de 1080 de ancho, lista para publicar.
 *
 * Dibuja cualquier `StatBlock`, así que sirve para las 34 estadísticas del
 * registro y para las dos que se arman aparte. No decide nada de contenido: el
 * título, las filas y la aclaración vienen resueltos.
 *
 * La pieza sale siempre oscura, aunque el sitio esté en claro. Es una imagen
 * que se sube a Instagram: tiene que salir igual la exporte quien la exporte.
 */

/** Ancho de la vista previa. La pieza real siempre mide 1080. */
const PREVIEW_WIDTH = 340

/*
 * El resplandor rojo de siempre, el mismo del fondo del sitio. Va en un style
 * inline y no en una clase porque html-to-image clona estilos calculados: un
 * degradado escrito acá viaja igual que uno de Tailwind, y así se lee al lado
 * de los números que lo usan.
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
  /** Si las filas van numeradas. Ver `Poster.ordered`. */
  ordered: boolean
  /** Le pasa el nodo al lote, para poder bajar todas de una. */
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
        El contenedor achica la vista; el nodo que se exporta conserva sus 1080.
        La altura del hueco se calcula, si no queda el espacio de la pieza entera
        debajo de la miniatura.
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
                  Los títulos van de "MVP" a "Tabla de universidades", así que
                  a este cuerpo casi todos parten en dos renglones. `text-balance`
                  los reparte parejo en vez de dejar una palabra suelta abajo.
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
                `justify-around` reparte las filas por el alto que sobre, así la
                misma pieza compone bien en 1350 y en 1920 sin dos maquetados.
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
  /** null cuando las filas no son un ranking: no lleva número. */
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
        Los logos todavía no están cargados en el bucket, así que hoy esto no se
        dibuja nunca. Queda puesto para que aparezcan solos cuando se suban.
        crossOrigin: sin eso el canvas queda contaminado y la exportación falla.
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
        `max-w-[46%]` y truncate: el valor no siempre es un número corto. "5.9k
        de oro" a este cuerpo se come media pieza, y sin tope se lleva puesto el
        nombre de al lado, que es lo que la gente vino a leer.
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
 * Convierte el nodo en PNG y lo baja.
 *
 * `document.fonts.ready` antes de capturar no es de más: html-to-image dibuja
 * lo que el navegador tenga en ese momento, y si la Archivo Black todavía no
 * terminó de cargar, el título sale en la tipografía de reserva. Es la falla
 * más silenciosa que tiene esto, porque la imagen se genera igual.
 */
export async function exportPoster(node: HTMLElement, format: FormatSpec, fileName: string) {
  await document.fonts.ready

  const dataUrl = await toPng(node, {
    width: format.width,
    height: format.height,
    pixelRatio: 1,
    cacheBust: true,
  })

  const link = document.createElement('a')
  link.download = fileName
  link.href = dataUrl
  link.click()
}
