/**
 * Light and dark theme.
 *
 * The theme is a `data-theme` attribute on <html>: the tokens in `globals.css`
 * hang off it, so it switches the whole site at once instead of component by
 * component. The preference is kept in localStorage.
 *
 * The default is dark and it is written into the HTML the server sends, which
 * cannot read localStorage. For anyone who chose light, `THEME_INIT_SCRIPT`
 * fixes the attribute while the browser is parsing the <head>, before the first
 * paint: without that there would be a dark flash on every load.
 */

export const THEMES = ['dark', 'light'] as const
export type Theme = (typeof THEMES)[number]

export const DEFAULT_THEME: Theme = 'dark'
export const THEME_STORAGE_KEY = 'lide-theme'

/** What is stored, or the default when there is nothing or localStorage is blocked. */
export function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

/**
 * The theme in effect right now, read from the DOM and not from localStorage:
 * the attribute is the source of truth, and it stays correct even when the
 * browser has site storage blocked.
 */
export function currentTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Private browsing or blocked cookies: the theme holds for this tab only.
  }
}

/**
 * Runs synchronously in the <head>. It carries its own `try` because
 * localStorage throws when the browser blocks storage for the site.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`
