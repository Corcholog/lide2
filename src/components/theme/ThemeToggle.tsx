'use client'

import { useLayoutEffect } from 'react'
import { applyTheme, currentTheme, readStoredTheme } from '@/lib/theme'

/**
 * Botón de tema del nav.
 *
 * No tiene estado, y eso es a propósito. El servidor no puede saber qué tema
 * eligió el visitante —está en localStorage— así que cualquier cosa que el botón
 * dibuje a partir del tema va a diferir de lo que renderiza el cliente al
 * hidratar. La salida es no dibujar nada a partir del tema: los dos íconos van
 * siempre en el HTML y el CSS decide cuál se ve, mirando el mismo `data-theme`
 * del que cuelgan todos los colores.
 *
 * Así el HTML del servidor y el del cliente son idénticos, el ícono correcto
 * aparece antes de que cargue el JavaScript, y al hacer clic el tema sale del
 * atributo del <html>, que es la fuente de verdad.
 */
export function ThemeToggle() {
  // En desarrollo React remonta una vez y al hacerlo borra los atributos de
  // <html> que no vienen del JSX, incluido el que puso el script del <head>.
  // Esto lo vuelve a poner; en producción no hace nada.
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
      {/* El sol se ve en el tema oscuro: es a dónde lleva el clic. */}
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
