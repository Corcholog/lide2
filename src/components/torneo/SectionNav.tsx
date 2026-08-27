'use client'

import { useEffect, useRef, useState } from 'react'
import { currentTheme, type Theme } from '@/lib/theme'

export interface NavSection {
  id: string
  label: string
}

/**
 * Barra de secciones de la página del torneo.
 *
 * Vive adentro de la portada, como último bloque después de los números, así
 * que la primera pantalla es una sola pieza: foto, título, cifras y por dónde
 * seguir. Al scrollear se despega y se ancla arriba.
 *
 * Ese anclaje es `fixed` y no `sticky`, y no por gusto: `sticky` sólo aguanta
 * pegado mientras el padre siga a la vista, y el padre acá es la portada, que
 * mide una pantalla y se va. Entonces la barra se saca del flujo a mano cuando
 * su lugar llega al tope de la ventana, y el div de afuera —que siempre mide lo
 * mismo— le guarda el hueco para que nada salte.
 */
export function SectionNav({ sections }: { sections: NavSection[] }) {
  const [active, setActive] = useState<string | null>(null)
  const [docked, setDocked] = useState(false)
  const [pageTheme, setPageTheme] = useState<Theme | null>(null)
  const holder = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = holder.current
    if (!node) return

    // Anclada quiere decir que el hueco que dejó llegó al tope de la ventana.
    // Se mide el hueco y no la barra: una vez `fixed`, la barra siempre está en
    // cero y la condición se quedaría trabada.
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
   * El tema de la página, para cuando la barra está anclada.
   *
   * Adentro de la portada hereda el tema oscuro, que es lo que corresponde:
   * está sobre la foto. Pero anclada arriba ya está sobre el sitio, y en tema
   * claro una franja negra ahí sería un cuerpo extraño. No alcanza con quitarle
   * el atributo, porque lo hereda de la portada: hay que ponerle el de la
   * página, y el servidor no lo sabe. De ahí el observer, que además la
   * acompaña si alguien toca el botón de tema con la barra ya anclada.
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
        // La primera en orden de página gana: si se ven dos, manda la de arriba.
        setActive(sections.find((section) => visible.has(section.id))?.id ?? null)
      },
      // Franja de lectura: desde abajo de la barra hasta el medio de la pantalla.
      { rootMargin: '-56px 0px -55% 0px' },
    )

    nodes.forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  }, [sections])

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
          Anclada ocupa el ancho de la ventana, así que se repite el contenedor
          del sitio para que los items no se despeguen de la columna. En su lugar
          de origen ya está adentro, y `mx-auto max-w-6xl` no hace nada.
        */}
        <div
          className={`mx-auto flex h-[var(--section-nav)] w-full max-w-6xl items-center gap-2 ${
            docked ? 'px-6' : ''
          }`}
        >
          <ul className="flex flex-1 gap-1 overflow-x-auto">
            {sections.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  aria-current={active === section.id ? 'true' : undefined}
                  /*
                   * Todo en rojo: la barra cierra la portada y tiene que
                   * levantar contra la foto, no perderse en gris. Lo que
                   * distingue a la sección en la que estás deja de ser el color
                   * y pasa a ser el bloque —relleno y borde—, en tres escalones:
                   * quieta es sólo texto, al pasar el mouse se rellena, y la
                   * actual además se enmarca.
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
            La flechita. La portada ocupa la pantalla entera, así que sin esto no
            queda ninguna señal de que abajo siga habiendo algo. Lleva a la
            primera sección, la misma del primer item: es un gesto, no un atajo
            distinto. Se apaga apenas la barra se ancla, que es cuando ya se
            entendió que la página sigue.
          */}
          {sections.length > 0 && (
            <a
              href={`#${sections[0].id}`}
              aria-label="Bajar al contenido"
              className={`shrink-0 border-2 border-transparent p-1 text-accent transition-opacity duration-200 hover:bg-accent-dim/60 hover:text-accent-soft ${
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
