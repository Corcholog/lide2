'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { isUuid, teamPath } from '@/lib/routes'

/**
 * Highlights a team everywhere in the fixture and group tables: on hover, or
 * pinned on click (other matchups dim).
 *
 * Pure CSS driven by one attribute (`data-team-scope`): the server-rendered
 * children never re-render, and hover runs no JavaScript. The cost is one CSS
 * rule set per team, fine for twenty teams.
 */

/** A team in the fixture; `matches` is its matchup count, for the notice. */
export interface FocusTeam {
  id: string
  name: string
  matches: number
}

function styleFor(id: string): string {
  const team = `[data-team="${id}"]`

  return (
    // Hover, only while no team is pinned.
    `[data-team-scope=""]:has(${team}:hover) ${team}{` +
    `background-color:color-mix(in srgb, var(--accent) 16%, transparent);` +
    `outline:1px solid color-mix(in srgb, var(--accent) 45%, transparent);` +
    `outline-offset:2px}` +
    // Pinned: stronger, so it stands out while scrolling.
    `[data-team-scope="${id}"] ${team}{` +
    `background-color:color-mix(in srgb, var(--accent) 26%, transparent);` +
    `outline:2px solid var(--accent);` +
    `outline-offset:2px}` +
    // Dim the other matchups.
    `[data-team-scope="${id}"] [data-fixture]:not(:has(${team})){opacity:.3}` +
    // Crests have white backgrounds baked in, so they are also desaturated and
    // darkened, or they would stay brighter than the highlighted names.
    `[data-team-scope="${id}"] [data-fixture]:not(:has(${team})) img{` +
    `filter:grayscale(1) brightness(.55)}`
  )
}

export function TeamFocus({
  teams,
  className = '',
  children,
}: {
  teams: FocusTeam[]
  /** Classes for the wrapper div. */
  className?: string
  children: ReactNode
}) {
  const [active, setActive] = useState<string | null>(null)
  const scope = useRef<HTMLDivElement>(null)

  // Only UUID-shaped ids are interpolated: they end up inside a <style>.
  const valid = teams.filter((team) => isUuid(team.id))
  const current = valid.find((team) => team.id === active) ?? null

  // The server-rendered buttons never re-render, so aria-pressed is synced in
  // the DOM for screen readers.
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

  // One delegated listener, so the fixture's buttons stay server markup.
  function pick(event: MouseEvent<HTMLDivElement>) {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-team]')
    if (!button) return

    const id = button.dataset.team ?? null
    setActive((chosen) => (chosen === id ? null : id))
  }

  return (
    // While a team is pinned, reserve space at the bottom so the fixed notice
    // does not cover the last row.
    <div
      ref={scope}
      data-team-scope={active ?? ''}
      onClick={pick}
      className={`${className} ${current ? 'pb-24 sm:pb-16' : ''}`}
    >
      {/*
        dangerouslySetInnerHTML because React escapes <style> text, which would
        turn the quotes in [data-team="..."] into &quot;. The quotes are needed:
        a UUID can start with a digit, which is not a valid bare CSS identifier.
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
          {/*
            Wraps on phones so the team name gets its own line instead of being
            truncated.
          */}
          <div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-x-3 gap-y-1 border-2 border-accent bg-surface px-3 py-2 text-sm shadow-hard">
            <span className="min-w-0 basis-full text-center sm:basis-auto sm:text-left">
              <span className="text-muted">Resaltando a </span>
              <span className="font-semibold">{current.name}</span>
            </span>
            <span className="shrink-0 text-xs text-faint">
              {current.matches} {current.matches === 1 ? 'partido' : 'partidos'}
            </span>
            <Link
              href={teamPath(current.id, 'portada')}
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
