'use client'

import { useLayoutEffect } from 'react'
import { applyTheme, currentTheme, readStoredTheme } from '@/lib/theme'

/**
 * The theme toggle button.
 *
 * Stateless on purpose: the server cannot know the saved theme (it is in
 * localStorage), so both icons are always rendered and CSS shows one based on
 * `data-theme`. Server and client HTML match, and on click the current theme is
 * read from the <html> attribute.
 */
export function ThemeToggle() {
  // In development React remounts once, which drops <html> attributes set by
  // the <head> script. This restores the theme; in production it does nothing.
  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-theme', readStoredTheme())
  }, [])

  function toggle() {
    applyTheme(currentTheme() === 'dark' ? 'light' : 'dark')
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title="Cambiar tema"
      className="rounded p-1.5 text-muted transition-colors hover:bg-raised hover:text-accent"
    >
      {/* The sun shows in the dark theme: it is what clicking switches to. */}
      <SunIcon />
      <MoonIcon />
      <span className="sr-only">Cambiar entre tema claro y oscuro</span>
    </button>
  )
}

function SunIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      className="size-4 light:hidden"
      aria-hidden
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4 dark:hidden"
      aria-hidden
    >
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  )
}
