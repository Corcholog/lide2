/**
 * Tema claro/oscuro.
 *
 * El tema es un atributo `data-theme` en <html>: los tokens de `globals.css`
 * cuelgan de ahí, así que cambia el sitio entero de una y no componente por
 * componente. La preferencia se guarda en localStorage.
 *
 * El default es oscuro y está escrito en el HTML que manda el servidor, que no
 * puede leer localStorage. Para el que eligió claro, `THEME_INIT_SCRIPT` corrige
 * el atributo mientras el navegador parsea el <head>, antes del primer pintado:
 * sin eso se vería un flash oscuro en cada carga.
 */

export const THEMES = ['dark', 'light'] as const
export type Theme = (typeof THEMES)[number]

export const DEFAULT_THEME: Theme = 'dark'
export const THEME_STORAGE_KEY = 'lide-theme'

/** Lo que hay guardado, o el default si no hay nada o localStorage está bloqueado. */
export function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

/**
 * El tema que esta puesto ahora, leido del DOM y no de localStorage: el atributo
 * es la fuente de verdad, y sigue siendo correcto aunque el navegador tenga el
 * almacenamiento bloqueado.
 */
export function currentTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Navegación privada o cookies bloqueadas: el tema vale para esta pestaña.
  }
}

/**
 * Corre sincrónico en el <head>. Sin `try` porque localStorage tira excepción
 * cuando el navegador bloquea el almacenamiento del sitio.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`
