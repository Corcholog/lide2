'use client'

import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

/**
 * A block of content in tabs.
 *
 * It was born as the fixture by matchday and now the fixture and the playoffs
 * share it, which are the home page's two long blocks. They used to be shown
 * one after another: the three matchdays were six rows of groups and the
 * bracket was three 768px columns you had to scroll sideways on a phone. In
 * both cases the answer is the same - one part at a time, the rest one button
 * away - and there is no sense in having two components that do that.
 *
 * THE PANELS ARE NEVER UNMOUNTED. All of them are always in the DOM: the
 * visible one sits in normal flow and the others stay `absolute`, transparent
 * and `inert`. That is deliberate, for two reasons.
 *
 * The first is that the tree inside is drawn by the server and travels here as
 * `children`; if it mounted and unmounted on every click, React would have to
 * redo each matchday's sixteen rows. It is the same decision TeamFocus already
 * takes, highlighting teams with CSS precisely so this does not re-render.
 *
 * The second is the height. With the panels stacked `absolute`, the box's
 * height is set by the visible one and nothing else, so matchday 3 - which has
 * one slot instead of two - does not drag the other two's empty space along.
 * A ribbon sliding horizontally, which is the other way of doing this, always
 * measures as tall as the tallest panel and the height would have to be
 * measured and animated by hand.
 *
 * `inert` is what makes the hidden panels not exist for the keyboard or for a
 * screen reader. Without it, tabbing from matchday 1's last row drops you
 * inside matchday 2, which is there but cannot be seen.
 */

/*
 * The classes go in whole and literal, never assembled from a template.
 * Tailwind generates the CSS by reading the text of the files: if the class is
 * built at runtime, the full name never appears in the source and the rule is
 * not emitted. The panel would still change, just without the animation.
 */
const ENTER_FROM_LEFT = 'motion-safe:animate-[entra-izq_.28s_ease-out]'
const ENTER_FROM_RIGHT = 'motion-safe:animate-[entra-der_.28s_ease-out]'

export interface Tab {
  /**
   * Unique across the whole page, not just within the group: the home page
   * mounts two sets of tabs and ARIA ids cannot repeat.
   */
  id: string
  /** What is read large on the button: "Fecha 1", "Cuartos". */
  title: string
  /** The small line below: the date, or how many were played. */
  detail: string | null
}

export function Tabs({
  tabs,
  label,
  children,
}: {
  tabs: Tab[]
  /** Which group of tabs this is, for anyone using a screen reader. */
  label: string
  /** One panel per tab, in the same order. */
  children: ReactNode[]
}) {
  const [current, setCurrent] = useState(0)
  // Which way the new panel comes in from: the left when moving forward.
  const [forward, setForward] = useState(true)
  /*
   * The animation only exists after the first click. Otherwise the first tab
   * would animate in on page load: a movement nobody asked for, in the only
   * thing on the home page that moves, and one that also ships in the server's
   * HTML. This is a transition between panels, not an entrance.
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

  // Arrow keys to move between tabs: it is what anybody arriving at one with
  // the keyboard expects, and it costs nothing.
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowRight') goTo(current + 1, true)
    else if (event.key === 'ArrowLeft') goTo(current - 1, true)
    else if (event.key === 'Home') goTo(0, true)
    else if (event.key === 'End') goTo(tabs.length - 1, true)
    else return
    event.preventDefault()
  }

  /*
   * Dragging with a finger. The 50px threshold and the comparison against the
   * vertical movement are there so the gesture is not stolen from the scroll:
   * if the finger went down further than it went sideways, the person is
   * scrolling the page and not changing panel.
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
          A grid and not `flex flex-wrap`. With flex, the three `flex-1` buttons
          at 390px fitted two on top and the third alone below taking the full
          width, so the last one looked more important than the others.
          `auto-fit` keeps the split even if there are ever more than three.
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
              // A single tab stop across the whole bar: you enter with Tab and
              // move along with the arrows.
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
                  ? // The animation starts on its own when the class appears,
                    // because the panel had none. Changing direction restarts
                    // it too, which is what you want going back and forth.
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
