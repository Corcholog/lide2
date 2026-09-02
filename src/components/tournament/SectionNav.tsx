'use client'

import { useEffect, useRef, useState } from 'react'
import { currentTheme, type Theme } from '@/lib/theme'

export interface NavSection {
  id: string
  label: string
}

/**
 * The tournament page's section bar.
 *
 * It lives inside the hero, as the last block after the numbers, so the first
 * screen is a single piece: photo, title, figures and where to go next. On
 * scroll it detaches and docks to the top.
 *
 * That docking is `fixed` and not `sticky`, and not out of preference:
 * `sticky` only holds while the parent is still in view, and the parent here is
 * the hero, which is one screen tall and leaves. So the bar is pulled out of
 * flow by hand when its slot reaches the top of the window, and the outer div -
 * which always measures the same - keeps the space so nothing jumps.
 */
export function SectionNav({ sections }: { sections: NavSection[] }) {
  const [active, setActive] = useState<string | null>(null)
  const [docked, setDocked] = useState(false)
  const [pageTheme, setPageTheme] = useState<Theme | null>(null)
  const holder = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = holder.current
    if (!node) return

    // Docked means the space it left has reached the top of the window. The
    // space is measured and not the bar: once `fixed`, the bar is always at
    // zero and the condition would be stuck true.
    const onScroll = () => setDocked(node.getBoundingClientRect().top <= 0)

    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  /*
   * The page's theme, for when the bar is docked.
   *
   * Inside the hero it inherits the dark theme, which is right: it sits over
   * the photo. But docked at the top it is over the site, and in the light
   * theme a black strip there would be a foreign body. Removing the attribute
   * is not enough, because it inherits it from the hero: it has to be given the
   * page's, and the server does not know it. Hence the observer, which also
   * follows along if somebody hits the theme button with the bar already
   * docked.
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
        // The first in page order wins: if two are visible, the upper one rules.
        setActive(sections.find((section) => visible.has(section.id))?.id ?? null)
      },
      // Reading band: from below the bar down to the middle of the screen.
      { rootMargin: '-56px 0px -55% 0px' },
    )

    nodes.forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  }, [sections])

  /*
   * Which step the stepper is on.
   *
   * At the very top, with the hero filling the screen, no section is inside the
   * reading band and the scroll-spy marks none: there the stepper settles on
   * the first one, which is where the first move leads.
   */
  const current = Math.max(0, sections.findIndex((section) => section.id === active))

  return (
    <div ref={holder} className="h-[var(--section-nav)]">
      <nav
        aria-label="Secciones del torneo"
        data-theme={docked ? (pageTheme ?? undefined) : undefined}
        className={
          docked
            ? 'fixed inset-x-0 top-0 z-30 border-b-2 border-line-strong bg-canvas/90 text-fg backdrop-blur'
            : 'relative'
        }
      >
        {/*
          Docked it takes the window's width, so the site container is repeated
          to keep the items from drifting off the column. In its original place
          it is already inside one, and `mx-auto max-w-6xl` does nothing.
        */}
        <div
          className={`mx-auto flex h-[var(--section-nav)] w-full max-w-6xl items-center gap-2 ${
            docked ? 'px-6' : ''
          }`}
        >
          {/*
            The whole list, from `sm` up. The five items add up to about 470px
            and a phone has 312: below that width the stepper takes over.
          */}
          <ul className="hidden flex-1 gap-1 sm:flex">
            {sections.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  aria-current={active === section.id ? 'true' : undefined}
                  /*
                   * All in red: the bar closes the hero and has to hold up
                   * against the photo, not get lost in grey. What sets the
                   * section you are in apart stops being the colour and becomes
                   * the block - fill and border - in three steps: at rest it is
                   * text alone, on hover it fills in, and the current one is
                   * framed as well.
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
            The phone's stepper.

            The list used to scroll sideways, which is the worse of the two
            options: a phone draws no scrollbar, so the three sections left
            outside did not exist. Here you always see which one you are on and
            the two arrows lead to the previous and the next.

            The name comes from the same scroll-spy that paints the list above,
            which means it updates itself as you scroll.
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
            The little down arrow. The hero fills the whole screen, so without
            this there is no sign left that anything continues below. It leads
            to the first section, the same as the first item: it is a gesture,
            not a different shortcut. It fades out the moment the bar docks,
            which is when the point that the page goes on has been made.

            Not on the phone: the stepper's right arrow plays that part there,
            and three arrows in 312px is noise.
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
 * One of the stepper's two arrows.
 *
 * When there is nowhere to go - the first and the last section - it dims
 * instead of disappearing: if it left, the name in the middle would shift on
 * every step and the bar would dance.
 */
function Step({ section, direction }: { section: NavSection | undefined; direction: 'prev' | 'next' }) {
  // p-2.5 and not p-1: over a 16px icon the target came to 24px, which is
  // exactly the WCAG 2.5.8 floor. This makes it 36 and it still fits beside the
  // section name at 390px.
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
