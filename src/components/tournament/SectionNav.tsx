'use client'

import { useEffect, useRef, useState } from 'react'
import { currentTheme, type Theme } from '@/lib/theme'

export interface NavSection {
  id: string
  label: string
}

/**
 * The home page's section bar.
 *
 * It sits at the bottom of the hero and, on scroll, docks under the site
 * header. Docking uses `fixed` rather than `sticky`, because sticky only holds
 * while the parent (the one-screen hero) is visible; the outer div keeps the
 * space so the layout does not jump. The header's height is measured because
 * it is both the docking offset and the top of the scroll-spy band.
 */

/** The site header's height: where this bar docks. */
function headerHeight(): number {
  return document.getElementById('barra-del-sitio')?.offsetHeight ?? 0
}

export function SectionNav({ sections }: { sections: NavSection[] }) {
  const [active, setActive] = useState<string | null>(null)
  const [docked, setDocked] = useState(false)
  const [pageTheme, setPageTheme] = useState<Theme | null>(null)
  const holder = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = holder.current
    if (!node) return

    /*
      Docked once the bar's placeholder reaches the underside of the header.
      The placeholder is measured, not the bar, which sits at that offset once
      fixed. The offset is read on mount and resize, not on every scroll, to
      avoid a forced reflow per frame.
    */
    let offset = headerHeight()
    const onScroll = () => setDocked(node.getBoundingClientRect().top <= offset)
    const onResize = () => {
      offset = headerHeight()
      onScroll()
    }

    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  /*
   * The page's theme, applied while docked. Inside the hero the bar inherits
   * the dark theme; docked over a light page it must use the page's theme,
   * which the server does not know. The observer follows theme changes.
   */
  useEffect(() => {
    const html = document.documentElement
    const read = () => setPageTheme(currentTheme())

    read()
    const observer = new MutationObserver(read)
    observer.observe(html, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const nodes = sections
      .map((section) => document.getElementById(section.id))
      .filter((node): node is HTMLElement => node !== null)

    if (nodes.length === 0) return

    const visible = new Set<string>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id)
          else visible.delete(entry.target.id)
        }
        // The first visible section in page order wins.
        setActive(sections.find((section) => visible.has(section.id))?.id ?? null)
      },
      // Reading band: from below both bars to the middle of the screen.
      {
        rootMargin: `-${Math.round(headerHeight() + (holder.current?.offsetHeight ?? 0))}px 0px -55% 0px`,
      },
    )

    nodes.forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  }, [sections])

  /*
   * The stepper's current section. At the top of the page no section is in the
   * reading band, so it defaults to the first.
   */
  const current = Math.max(0, sections.findIndex((section) => section.id === active))

  return (
    <div ref={holder} className="h-[var(--section-nav)]">
      <nav
        aria-label="Secciones del torneo"
        data-theme={docked ? (pageTheme ?? undefined) : undefined}
        className={
          docked
            ? 'fixed inset-x-0 top-[var(--site-header)] z-30 border-b-2 border-line-strong bg-canvas/90 text-fg backdrop-blur'
            : 'relative'
        }
      >
        {/*
          Docked, the bar spans the window, so the site container is repeated to
          keep items aligned with the page column.
        */}
        <div
          className={`mx-auto flex h-[var(--section-nav)] w-full max-w-6xl items-center gap-2 ${
            docked ? 'px-6' : ''
          }`}
        >
          {/* The full list from `sm` up; phones get the stepper below. */}
          <ul className="hidden flex-1 gap-1 sm:flex">
            {sections.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  aria-current={active === section.id ? 'true' : undefined}
                  /*
                   * All items are red so the bar holds up over the photo; the
                   * current section is marked by fill and border instead of
                   * color.
                   */
                  className={`block whitespace-nowrap border-2 px-3 py-1 text-xs font-bold uppercase tracking-wide transition-colors ${
                    active === section.id
                      ? 'border-accent bg-accent-dim text-accent'
                      : 'border-transparent text-accent hover:bg-accent-dim/60 hover:text-accent-soft'
                  }`}
                >
                  {section.label}
                </a>
              </li>
            ))}
          </ul>

          {/*
            Phone stepper: the current section with previous and next arrows. A
            horizontally scrolling list would hide sections, since phones show no
            scrollbar. The name follows the scroll-spy.
          */}
          <div className="flex flex-1 items-center gap-1 sm:hidden">
            <Step section={sections[current - 1]} direction="prev" />
            <a
              href={`#${sections[current]?.id ?? ''}`}
              aria-current={active ? 'true' : undefined}
              className="min-w-0 flex-1 truncate border-2 border-accent bg-accent-dim px-2 py-1 text-center text-xs font-bold uppercase tracking-wide text-accent"
            >
              {sections[current]?.label}
            </a>
            <Step section={sections[current + 1]} direction="next" />
          </div>

          {/*
            Down arrow to the first section, since the hero fills the screen.
            Fades out once the bar docks. Hidden on phones, where the stepper's
            next arrow does the same.
          */}
          {sections.length > 0 && (
            <a
              href={`#${sections[0].id}`}
              aria-label="Bajar al contenido"
              className={`hidden shrink-0 border-2 border-transparent p-1 text-accent transition-opacity duration-200 hover:bg-accent-dim/60 hover:text-accent-soft sm:block ${
                docked ? 'pointer-events-none opacity-0' : 'opacity-100 motion-safe:animate-bounce'
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-4"
                aria-hidden
              >
                <path d="M12 5v14M5 12l7 7 7-7" />
              </svg>
            </a>
          )}
        </div>
      </nav>
    </div>
  )
}

/**
 * A stepper arrow. At the first or last section it dims instead of
 * disappearing, so the section name does not shift.
 */
function Step({ section, direction }: { section: NavSection | undefined; direction: 'prev' | 'next' }) {
  // p-2.5 gives a 36px target (WCAG 2.5.8 asks for at least 24px).
  const shared = 'shrink-0 border-2 border-transparent p-2.5 text-accent'

  if (!section) {
    return (
      <span className={`${shared} opacity-25`} aria-hidden>
        <Chevron direction={direction} />
      </span>
    )
  }

  return (
    <a
      href={`#${section.id}`}
      aria-label={`${direction === 'prev' ? 'Anterior' : 'Siguiente'}: ${section.label}`}
      className={`${shared} transition-colors hover:bg-accent-dim/60 hover:text-accent-soft`}
    >
      <Chevron direction={direction} />
    </a>
  )
}

function Chevron({ direction }: { direction: 'prev' | 'next' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4"
      aria-hidden
    >
      <path d={direction === 'prev' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
    </svg>
  )
}
