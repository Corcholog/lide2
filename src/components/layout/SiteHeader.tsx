'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { ThemeToggle } from '@/components/theme/ThemeToggle'

/**
 * The site's bar.
 *
 * It did not fit on a phone: the logo, the five links, the theme button and the
 * sign-in one add up to about 540px of width against the 312 usable on a 360
 * screen. And because <html> carries `overflow-x-clip` - which is there so the
 * home page can break out of the container without producing horizontal scroll
 * - whatever overflowed could not be scrolled to: it was clipped and vanished.
 * Which is to say there was no way to reach Estadísticas or the theme switch
 * from a phone.
 *
 * From `md` up the usual bar shows; below it, the links tuck behind the menu
 * button and the panel drops down under the bar.
 *
 * IT IS PINNED TO THE TOP. Two pages dock a section bar there while you scroll
 * - the tournament's and the stats' - and with the site bar gone that strip
 * looked like the site's whole navigation while leading nowhere except further
 * down the same page: reaching Estadísticas from the bottom of a listing meant
 * scrolling all the way back up. Pinned, the section bar docks UNDER it
 * (`--site-header` is where, and `SectionNav` measures this element to know),
 * so the two read as one stack: where you can go, and where you are.
 *
 * It is a client component because the menu holds state. The sign-out action
 * arrives as a prop from the layout, which is a server component: a server
 * action can be passed like that and the <form> still runs it on the server.
 */

export interface NavLink {
  href: string
  label: string
}

export function SiteHeader({
  links,
  email,
  signOut,
}: {
  links: NavLink[]
  /** The email of whoever has a session open, or null when there is none. */
  email: string | null
  signOut: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const header = useRef<HTMLElement>(null)

  /*
   * Navigating closes the menu. Without this it stays open over the new page,
   * because the App Router does not unmount the layout on a route change.
   *
   * It is adjusted during render and not in a `useEffect`: with the effect,
   * React first paints the open menu over the new page and only then closes it,
   * which is a flicker and one render too many. Comparing against the previous
   * route is the pattern React recommends for this.
   */
  const [lastPath, setLastPath] = useState(pathname)
  if (pathname !== lastPath) {
    setLastPath(pathname)
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    // A click outside closes it. It goes on `pointerdown` and not on `click`
    // so it responds before the element underneath does its own thing.
    const onOutside = (event: PointerEvent) => {
      if (!header.current?.contains(event.target as Node)) setOpen(false)
    }

    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onOutside)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onOutside)
    }
  }, [open])

  /** The section you are in. `/` is the logo, so it does not count here. */
  const isCurrent = (href: string) => pathname === href || pathname.startsWith(`${href}/`)

  return (
    <header
      ref={header}
      /*
        The id is not decoration: `SectionNav` reads this element's height to
        know how far down to dock. It measures rather than parsing
        `--site-header` because a variable comes back as "3.875rem", and turning
        that into pixels means guessing the root font size - while the bar
        itself already knows what it is worth.
      */
      id="barra-del-sitio"
      className="sticky top-0 z-40 h-[var(--site-header)] border-b-2 border-line bg-surface/85 backdrop-blur"
    >
      <div className="mx-auto flex h-full w-full max-w-6xl items-center gap-4 px-6 sm:gap-6">
        <Link href="/" className="font-display shrink-0 text-xl font-bold uppercase tracking-wide">
          LIDE
        </Link>

        {/*
          No "Torneo" link: the home page IS the tournament, and the logo on the
          left already leads there. A nav item pointing at the page you are
          already on is an invitation to click for nothing.
        */}
        <nav aria-label="Secciones" className="hidden flex-1 gap-4 text-sm md:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isCurrent(link.href) ? 'page' : undefined}
              className={`transition-colors hover:text-accent ${
                isCurrent(link.href) ? 'font-medium text-accent' : 'text-fg-soft'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex flex-1 items-center justify-end gap-4 md:flex-none">
          <ThemeToggle />

          {email && (
            <div className="hidden items-center gap-4 md:flex">
              <Session email={email} signOut={signOut} />
            </div>
          )}

          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="menu-del-sitio"
            aria-label={open ? 'Cerrar el menú' : 'Abrir el menú'}
            className="-mr-1 cursor-pointer p-1 text-fg-soft transition-colors hover:text-accent md:hidden"
          >
            <MenuIcon open={open} />
          </button>
        </div>
      </div>

      {open && (
        // No scrim darkening the page: the click outside already closes it,
        // and a panel of four links does not need the rest of the site dimmed
        // to be read. It hangs off the bar, so with the bar pinned it stays.
        <div
          id="menu-del-sitio"
          className="absolute inset-x-0 top-full border-b-2 border-line bg-surface shadow-hard md:hidden"
        >
          <nav aria-label="Secciones" className="flex flex-col divide-y divide-line">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isCurrent(link.href) ? 'page' : undefined}
                className={`px-6 py-3 text-sm transition-colors hover:bg-raised ${
                  isCurrent(link.href) ? 'font-medium text-accent' : 'text-fg-soft'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {email && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-line px-6 py-3">
              <Session email={email} signOut={signOut} inMenu />
            </div>
          )}
        </div>
      )}
    </header>
  )
}

/**
 * Who is signed in and how to get out. Not how to get in: that is /login, by
 * hand.
 *
 * The email is the only thing that differs between the two places: in the menu
 * it gets a whole row and always shows, and in the bar it competes with the
 * links, so it only appears once there is room to spare.
 */
function Session({
  email,
  signOut,
  inMenu = false,
}: {
  email: string | null
  signOut: () => Promise<void>
  inMenu?: boolean
}) {
  /*
   * With no session nothing is drawn, not even a "Sign in".
   *
   * The site is for watching the tournament and the only person who needs to
   * sign in knows /login exists and goes there alone. A sign-in button in the
   * bar suggests to everybody else that there is something more behind it and
   * that they are missing out, when all that is behind it is the upload panel.
   *
   * /login still exists and still works; what is removed is the sign, not the
   * door. robots.ts already had it under disallow.
   */
  if (!email) return null

  return (
    <>
      <span
        className={`min-w-0 truncate text-xs text-faint ${inMenu ? '' : 'hidden lg:inline'}`}
      >
        {email}
      </span>
      <form action={signOut}>
        <button
          type="submit"
          className="cursor-pointer text-xs text-muted transition-colors hover:text-accent"
        >
          Salir
        </button>
      </form>
    </>
  )
}

/**
 * The three bars, which fold into a cross when open.
 *
 * One SVG with the same three lines transformed, and not two different icons:
 * that way the transition reads as the icon folding, which is what says what
 * the button does.
 */
function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="size-6"
      aria-hidden
    >
      <line
        x1="4"
        y1="7"
        x2="20"
        y2="7"
        className={`origin-center transition-transform duration-200 ${
          open ? 'translate-y-[5px] rotate-45' : ''
        }`}
      />
      <line
        x1="4"
        y1="12"
        x2="20"
        y2="12"
        className={`transition-opacity duration-200 ${open ? 'opacity-0' : ''}`}
      />
      <line
        x1="4"
        y1="17"
        x2="20"
        y2="17"
        className={`origin-center transition-transform duration-200 ${
          open ? '-translate-y-[5px] -rotate-45' : ''
        }`}
      />
    </svg>
  )
}
