'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'

/**
 * Highlights a team everywhere it appears: on hover over any one of them, and
 * pinned until further notice on click.
 *
 * It is for reading the fixture. You pass over "Equipo 15" in matchday 1 and
 * its other games and its row in the group table light up; click as well and
 * the highlight stays put, the matchups it is not in dim, and you can scroll
 * all three matchdays seeing only theirs.
 *
 * The highlight is CSS and not React state, and that is deliberate: the only
 * thing that changes on click is the value of `data-team-scope` on this div, an
 * attribute. The fixture's tree is drawn by the server and never re-renders -
 * it travels as `children`, so React passes it straight through - and the hover
 * fires not one line of JavaScript. With state, every mouse move would
 * re-render the forty rows.
 *
 * The price is one rule per team, because CSS cannot say "the ones holding the
 * same value as the pinned one". With twenty teams that is a handful; if they
 * were ever hundreds, state would be the better trade.
 */

/** A team in the fixture. `matches` is how many matchups it has, for the notice. */
export interface FocusTeam {
  id: string
  name: string
  matches: number
}

/**
 * Only UUID-shaped ids are interpolated. The ids come from the database and not
 * from anything a visitor types, but this is emitted inside a <style>: if the
 * source ever changes, the filter is already in place.
 */
const UUID = /^[0-9a-fA-F-]{36}$/

function styleFor(id: string): string {
  const team = `[data-team="${id}"]`

  return (
    // Hover, only while none is pinned: otherwise the highlight following the
    // mouse competes with the one the visitor left in place.
    `[data-team-scope=""]:has(${team}:hover) ${team}{` +
    `background-color:color-mix(in srgb, var(--accent) 16%, transparent);` +
    `outline:1px solid color-mix(in srgb, var(--accent) 45%, transparent);` +
    `outline-offset:2px}` +
    // Pinned: stronger, because it has to survive being scrolled past.
    `[data-team-scope="${id}"] ${team}{` +
    `background-color:color-mix(in srgb, var(--accent) 26%, transparent);` +
    `outline:2px solid var(--accent);` +
    `outline-offset:2px}` +
    // And the matchups it does not play in dim. That is what makes its own
    // jump out of a grid of forty games.
    `[data-team-scope="${id}"] [data-fixture]:not(:has(${team})){opacity:.3}` +
    /*
     * The crests, dimmed a little further than the rest of the row.
     *
     * The PNGs are normalized with the white background inside the file, so a
     * white square at 30% is still brighter than a lit-up team name: the eye
     * went to the dimmed logo before the data. Desaturated and darkened, the
     * dimmed row reads as one thing.
     */
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
  /** The scope is one more div; letting it be styled saves nesting another beside it. */
  className?: string
  children: ReactNode
}) {
  const [active, setActive] = useState<string | null>(null)
  const scope = useRef<HTMLDivElement>(null)

  const valid = teams.filter((team) => UUID.test(team.id))
  const current = valid.find((team) => team.id === active) ?? null

  // The tree below was drawn by the server and never re-renders, so the
  // buttons' state is synced by hand. It is the flip side of not making the
  // whole fixture a client component: without this a screen reader would always
  // announce "not pressed".
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

  // A single listener at the top instead of one per team: that way the
  // fixture's buttons stay server markup, with no handler of their own.
  function pick(event: MouseEvent<HTMLDivElement>) {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-team]')
    if (!button) return

    const id = button.dataset.team ?? null
    setActive((chosen) => (chosen === id ? null : id))
  }

  return (
    // The notice is `fixed` and rests over the last visible row. While one is
    // pinned, the content reserves its height below; without that it covered
    // the fixture's last matchup, which on a phone is where it hurts most.
    <div
      ref={scope}
      data-team-scope={active ?? ''}
      onClick={pick}
      className={`${className} ${current ? 'pb-24 sm:pb-16' : ''}`}
    >
      {/*
        dangerouslySetInnerHTML and not {rules}: React escapes the text of any
        element, <style> included, and the quotes in [data-team="..."] would come
        out as &quot;, leaving the selector invalid. The quotes cannot be avoided
        because a UUID starts with a digit and is not a valid bare CSS
        identifier.
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
            At 390px "Resaltando a " + the name + the count + "Ver equipo" + the
            cross do not fit on one line, and since the name was what truncated,
            what got cut was exactly the one fact the notice exists to give: it
            read "Resaltando a Equipo…". Wrapping, the name takes a full line of
            its own on the phone and goes back to a single line from `sm` up,
            where there was always room.
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
