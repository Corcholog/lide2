'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { ThemeToggle } from '@/components/theme/ThemeToggle'

/**
 * The site header, pinned to the top.
 *
 * From `md` up the links show inline; below that they are behind a menu button,
 * since they do not fit on a phone (and <html> has `overflow-x-clip`, so
 * overflow would be unreachable). Section bars dock under this header at
 * `--site-header`, and `SectionNav` measures it.
 *
 * A client component for the menu state. The sign-out server action comes from
 * the layout as a prop.
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
   * Close the menu on navigation: the layout does not unmount between routes.
   * Adjusted during render, as React recommends, rather than in an effect, which
   * would paint the open menu over the new page first.
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
    // `pointerdown` so it closes before the element underneath reacts.
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

  /** Whether a link is the current section. `/` is the logo, not a link here. */
  const isCurrent = (href: string) => pathname === href || pathname.startsWith(`${href}/`)

  return (
    <header
      ref={header}
      /*
        `SectionNav` reads this element's height by id to know where to dock
        (measuring is simpler than converting `--site-header` from rem).
      */
      id="barra-del-sitio"
      className="sticky top-0 z-40 h-[var(--site-header)] border-b-2 border-line bg-surface/85 backdrop-blur"
    >
      <div className="mx-auto flex h-full w-full max-w-6xl items-center gap-4 px-6 sm:gap-6">
        <Link href="/" className="font-display shrink-0 text-xl font-bold uppercase tracking-wide">
          LIDE
        </Link>

        {/* No home link: the logo already leads there. */}
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
        // No backdrop: clicking outside closes it, and the panel is small.
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
 * The signed-in email and the sign-out button. In the header bar the email only
 * shows on wide screens; in the menu it always shows.
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
   * Nothing without a session, not even a sign-in link: visitors have no reason
   * to sign in, and admins go to /login directly.
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

/** Menu icon: three lines that fold into a cross when open. */
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
