/**
 * Light and dark theme.
 *
 * The theme is a `data-theme` attribute on <html>, which the tokens in
 * `globals.css` depend on; the choice is saved in localStorage. The server
 * renders dark, and `THEME_INIT_SCRIPT` applies a saved light choice while the
 * <head> is parsed, before the first paint, to avoid a dark flash.
 */

export const THEMES = ['dark', 'light'] as const
export type Theme = (typeof THEMES)[number]

export const DEFAULT_THEME: Theme = 'dark'
export const THEME_STORAGE_KEY = 'lide-theme'

/** The saved theme, or the default when there is none or storage is blocked. */
export function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

/**
 * The theme in effect, read from the DOM attribute (the source of truth, even
 * when storage is blocked).
 */
export function currentTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Storage blocked (e.g. private browsing): the choice lasts for this tab.
  }
}

/**
 * Runs synchronously in the <head>, with its own `try` because localStorage
 * throws when storage is blocked.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`
