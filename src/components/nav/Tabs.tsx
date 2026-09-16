'use client'

import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

/**
 * Tabbed content, used by the home page's fixture and playoffs.
 *
 * Panels are never unmounted: the active one is in normal flow and the others
 * are `absolute`, transparent and `inert`. This avoids re-rendering the
 * server-rendered children on every switch, and lets the container's height
 * follow the active panel only. `inert` keeps hidden panels out of keyboard
 * navigation and screen readers.
 */

/*
 * Full class names, never assembled at runtime: Tailwind only generates classes
 * it finds written in the source.
 */
const ENTER_FROM_LEFT = 'motion-safe:animate-[entra-izq_.28s_ease-out]'
const ENTER_FROM_RIGHT = 'motion-safe:animate-[entra-der_.28s_ease-out]'

export interface Tab {
  /** Unique across the page: the home page has two tab sets and ARIA ids must not repeat. */
  id: string
  /** The tab's main label: "Fecha 1", "Cuartos". */
  title: string
  /** The secondary line: the date or how many games are decided. */
  detail: string | null
}

export function Tabs({
  tabs,
  label,
  children,
}: {
  tabs: Tab[]
  /** Accessible name of the tab list. */
  label: string
  /** One panel per tab, in the same order. */
  children: ReactNode[]
}) {
  const [current, setCurrent] = useState(0)
  // Direction the new panel enters from: from the right when moving forward.
  const [forward, setForward] = useState(true)
  /*
   * No animation until the first switch, so the initial tab does not animate
   * on page load.
   */
  const [moved, setMoved] = useState(false)
  const tablist = useRef<HTMLDivElement>(null)
  const touch = useRef<{ x: number; y: number } | null>(null)

  function goTo(target: number, focus = false) {
    const i = Math.max(0, Math.min(tabs.length - 1, target))
    if (i === current) return
    setForward(i > current)
    setCurrent(i)
    setMoved(true)
    if (focus) {
      tablist.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[i]?.focus()
    }
  }

  // Arrow keys, Home and End, as expected for a tab list.
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowRight') goTo(current + 1, true)
    else if (event.key === 'ArrowLeft') goTo(current - 1, true)
    else if (event.key === 'Home') goTo(0, true)
    else if (event.key === 'End') goTo(tabs.length - 1, true)
    else return
    event.preventDefault()
  }

  /*
   * Swipe between panels. The 50px threshold and the check against vertical
   * movement leave page scrolling alone.
   */
  function onSwipeEnd(x: number, y: number) {
    const start = touch.current
    touch.current = null
    if (!start) return
    const dx = x - start.x
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(y - start.y)) return
    goTo(current + (dx < 0 ? 1 : -1))
  }

  return (
    <>
      <div
        ref={tablist}
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        /*
          A grid rather than flex-wrap, so three tabs on a phone split evenly
          instead of wrapping two and one.
        */
        className="grid gap-0.5 bg-line p-0.5 [grid-template-columns:repeat(auto-fit,minmax(6rem,1fr))]"
      >
        {tabs.map((tab, i) => {
          const active = i === current
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`${tab.id}-tab`}
              aria-selected={active}
              aria-controls={`${tab.id}-panel`}
              // A single tab stop: Tab enters the list, arrows move within it.
              tabIndex={active ? 0 : -1}
              onClick={() => goTo(i)}
              className={`cursor-pointer px-4 py-2 text-left transition-colors ${
                active ? 'bg-accent-strong text-white' : 'bg-surface text-muted hover:text-fg'
              }`}
            >
              <span className="block text-sm font-bold uppercase tracking-tight">{tab.title}</span>
              {tab.detail && (
                <span
                  className={`block truncate text-[11px] ${active ? 'text-white/75' : 'text-faint'}`}
                >
                  {tab.detail}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div
        className="relative overflow-hidden"
        onTouchStart={(e) =>
          (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })
        }
        onTouchEnd={(e) => onSwipeEnd(e.changedTouches[0].clientX, e.changedTouches[0].clientY)}
      >
        {children.map((panel, i) => {
          const active = i === current
          const id = tabs[i]?.id ?? i
          return (
            <div
              key={id}
              role="tabpanel"
              id={`${id}-panel`}
              aria-labelledby={`${id}-tab`}
              inert={!active}
              className={
                active
                  ? // The class is added on activation, which starts the
                    // animation; a direction change restarts it.
                    !moved
                      ? ''
                      : forward
                        ? ENTER_FROM_LEFT
                        : ENTER_FROM_RIGHT
                  : 'pointer-events-none absolute inset-x-0 top-0 opacity-0'
              }
            >
              {panel}
            </div>
          )
        })}
      </div>
    </>
  )
}
