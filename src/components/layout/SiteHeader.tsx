'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { ThemeToggle } from '@/components/theme/ThemeToggle'

/**
 * La barra del sitio.
 *
 * En un teléfono no entraba: el logo, los cinco links, el botón de tema y el
 * de entrar suman unos 540px de ancho contra los 312 útiles de una pantalla de
 * 360. Y como <html> lleva `overflow-x-clip` —que está para que la portada
 * pueda salirse del contenedor sin generar scroll horizontal— lo que sobraba no
 * se podía scrollear: se cortaba y desaparecía. O sea que desde un teléfono no
 * había manera de llegar a Estadísticas ni al cambio de tema.
 *
 * Desde `md` se ve la barra de siempre; abajo, los links se guardan detrás del
 * botón de menú y el panel se despliega bajo la barra.
 *
 * Es un componente cliente porque el menú tiene estado. La acción de cerrar
 * sesión llega como prop desde el layout, que es un componente servidor: una
 * server action se puede pasar así y el <form> la sigue ejecutando en el
 * servidor.
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
  /** El mail de quien tiene la sesión abierta, o null si no hay ninguna. */
  email: string | null
  signOut: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const header = useRef<HTMLElement>(null)

  /*
   * Navegar cierra el menú. Sin esto queda abierto sobre la página nueva,
   * porque el App Router no desmonta el layout al cambiar de ruta.
   *
   * Se ajusta durante el render y no en un `useEffect`: con el efecto, React
   * pinta primero el menú abierto sobre la página nueva y recién después lo
   * cierra, o sea un parpadeo y un render de más. Comparar contra la ruta
   * anterior es el patrón que recomienda React para esto.
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
    // Un clic afuera cierra. Va en `pointerdown` y no en `click` para que
    // responda antes de que el elemento de abajo haga lo suyo.
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

  /** La sección en la que se está. `/` es el logo, así que no cuenta acá. */
  const isCurrent = (href: string) => pathname === href || pathname.startsWith(`${href}/`)

  return (
    <header
      ref={header}
      className="relative z-40 h-[var(--site-header)] border-b-2 border-line bg-surface/85 backdrop-blur"
    >
      <div className="mx-auto flex h-full w-full max-w-6xl items-center gap-4 px-6 sm:gap-6">
        <Link href="/" className="font-display shrink-0 text-xl font-bold uppercase tracking-wide">
          LIDE
        </Link>

        {/*
          Sin link a "Torneo": la home ES el torneo, y el logo de la izquierda ya
          lleva ahí. Un item de nav que apunta a la página donde ya estás es una
          invitación a hacer clic para nada.
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
        // Sin cortina que oscurezca la página: la barra no está fijada, así que
        // una cortina `fixed` se quedaría tapando todo mientras el menú se va
        // scrolleando hacia arriba. El clic afuera ya cierra.
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
 * Quién está adentro y cómo salir. Entrar no: eso es /login, a mano.
 *
 * El mail es lo único que cambia entre los dos lugares: en el menú tiene una
 * fila entera y se muestra siempre, y en la barra compite con los links, así
 * que aparece recién cuando hay lugar de sobra.
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
   * Sin sesion no se dibuja nada, ni siquiera un "Entrar".
   *
   * El sitio es para ver el torneo y la unica persona que necesita entrar sabe
   * que existe /login y va sola. Un boton de acceso en la barra le sugiere al
   * resto que hay algo mas atras y que se estan perdiendo de algo, cuando lo
   * unico que hay atras es el panel de carga.
   *
   * /login sigue existiendo y andando; lo que se saca es el cartel, no la
   * puerta. robots.ts ya la tenia en disallow.
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
 * Las tres rayas, que al abrirse se vuelven una cruz.
 *
 * Un solo SVG con las mismas tres líneas transformadas, y no dos íconos
 * distintos: así la transición se ve como que el ícono se pliega, que es lo que
 * dice qué hace el botón.
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
