'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'

/**
 * Resalta a un equipo en todas sus apariciones: al pasar el mouse por una, y
 * fijado hasta nuevo aviso al hacer clic.
 *
 * Sirve para leer el fixture. Pasás por "Equipo 15" en la fecha 1 y se te
 * encienden sus otros partidos y su fila en la tabla del grupo; si además hacés
 * clic, el resaltado queda puesto, los cruces donde no está se apagan y podés
 * scrollear las tres fechas viendo sólo los suyos.
 *
 * El resaltado es CSS y no estado de React, y eso es a propósito: lo único que
 * cambia al hacer clic es el valor de `data-team-scope` en este div, un atributo.
 * El árbol del fixture lo dibuja el servidor y no se vuelve a renderizar nunca
 * —viaja como `children`, así que React lo pasa tal cual—, y el hover no
 * dispara ni una línea de JavaScript. Con estado, cada movimiento del mouse
 * re-renderizaría las cuarenta filas.
 *
 * El precio es una regla por equipo, porque CSS no sabe decir "los que tengan
 * el mismo valor que el que está fijado". Con veinte equipos es un puñado; si
 * algún día fueran cientos, convendría el estado.
 */

/** Un equipo del fixture. `matches` es cuántos cruces tiene, para el cartel. */
export interface FocusTeam {
  id: string
  name: string
  matches: number
}

/**
 * Sólo se interpolan ids con forma de UUID. Los ids salen de la base y no de
 * nada que escriba un visitante, pero esto se emite dentro de un <style>: si
 * algún día la fuente cambia, el filtro ya está puesto.
 */
const UUID = /^[0-9a-fA-F-]{36}$/

function styleFor(id: string): string {
  const team = `[data-team="${id}"]`

  return (
    // Hover, sólo mientras no haya ninguno fijado: si no, el resaltado que
    // sigue al mouse compite con el que el visitante dejó puesto.
    `[data-team-scope=""]:has(${team}:hover) ${team}{` +
    `background-color:color-mix(in srgb, var(--accent) 16%, transparent);` +
    `outline:1px solid color-mix(in srgb, var(--accent) 45%, transparent);` +
    `outline-offset:2px}` +
    // Fijado: más fuerte, porque tiene que aguantar que se scrollee.
    `[data-team-scope="${id}"] ${team}{` +
    `background-color:color-mix(in srgb, var(--accent) 26%, transparent);` +
    `outline:2px solid var(--accent);` +
    `outline-offset:2px}` +
    // Y los cruces donde no juega se apagan. Es lo que hace que los suyos
    // salten a la vista en una grilla de cuarenta partidos.
    `[data-team-scope="${id}"] [data-fixture]:not(:has(${team})){opacity:.3}`
  )
}

export function TeamFocus({
  teams,
  className = '',
  children,
}: {
  teams: FocusTeam[]
  /** El scope es un div más; que se lo pueda vestir evita anidar otro al lado. */
  className?: string
  children: ReactNode
}) {
  const [active, setActive] = useState<string | null>(null)
  const scope = useRef<HTMLDivElement>(null)

  const valid = teams.filter((team) => UUID.test(team.id))
  const current = valid.find((team) => team.id === active) ?? null

  // El árbol de abajo lo dibujó el servidor y no se vuelve a renderizar, así
  // que el estado de los botones se sincroniza a mano. Es la contracara de no
  // hacer cliente el fixture entero: sin esto un lector de pantalla anunciaría
  // siempre "no presionado".
  useEffect(() => {
    scope.current?.querySelectorAll('button[data-team]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.getAttribute('data-team') === active))
    })
  }, [active])

  useEffect(() => {
    if (!active) return

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActive(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active])

  // Un solo listener arriba de todo en vez de uno por equipo: así los botones
  // del fixture siguen siendo marcado del servidor, sin handler propio.
  function pick(event: MouseEvent<HTMLDivElement>) {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-team]')
    if (!button) return

    const id = button.dataset.team ?? null
    setActive((chosen) => (chosen === id ? null : id))
  }

  return (
    <div ref={scope} data-team-scope={active ?? ''} onClick={pick} className={className}>
      {/*
        dangerouslySetInnerHTML y no {rules}: React escapa el texto de cualquier
        elemento, incluido <style>, y las comillas de [data-team="..."] saldrían
        como &quot; dejando el selector inválido. Las comillas no se pueden
        evitar porque un UUID empieza con dígito y no es un identificador CSS
        válido suelto.
      */}
      {valid.length > 0 && (
        <style dangerouslySetInnerHTML={{ __html: valid.map((team) => styleFor(team.id)).join('') }} />
      )}

      {children}

      {current && (
        <div
          role="status"
          className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4"
        >
          <div className="pointer-events-auto flex max-w-full items-center gap-3 border-2 border-accent bg-surface px-3 py-2 text-sm shadow-hard">
            <span className="min-w-0 truncate">
              <span className="text-muted">Resaltando a </span>
              <span className="font-semibold">{current.name}</span>
            </span>
            <span className="shrink-0 text-xs text-faint">
              {current.matches} {current.matches === 1 ? 'partido' : 'partidos'}
            </span>
            <Link
              href={`/equipos/${current.id}`}
              className="shrink-0 text-xs font-bold uppercase tracking-wide text-accent transition-colors hover:text-accent-soft"
            >
              Ver equipo
            </Link>
            <button
              type="button"
              onClick={() => setActive(null)}
              aria-label="Quitar el resaltado"
              className="shrink-0 cursor-pointer px-1 text-muted transition-colors hover:text-accent"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
