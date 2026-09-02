'use client'

import { useLayoutEffect } from 'react'
import { applyTheme, currentTheme, readStoredTheme } from '@/lib/theme'

/**
 * The nav's theme button.
 *
 * It holds no state, and that is deliberate. The server cannot know which theme
 * the visitor chose - it is in localStorage - so anything the button draws off
 * the theme would differ from what the client renders while hydrating. The way
 * out is to draw nothing off the theme: both icons are always in the HTML and
 * the CSS decides which one shows, looking at the same `data-theme` every colour
 * hangs off.
 *
 * That way the server's HTML and the client's are identical, the right icon
 * appears before the JavaScript loads, and on click the theme comes from the
 * <html> attribute, which is the source of truth.
 */
export function ThemeToggle() {
  // In development React remounts once and doing so wipes the <html>
  // attributes that do not come from JSX, including the one the <head> script
  // set. This puts it back; in production it does nothing.
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
      {/* The sun shows in the dark theme: it is where the click leads. */}
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
