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

  /*
   * En qué escalón está el paso a paso.
   *
   * Arriba de todo, con la portada llena, no hay ninguna sección en la franja
   * de lectura y el scroll-spy no marca ninguna: ahí el paso a paso se planta
   * en la primera, que es a dónde lleva el primer movimiento.
   */
  const current = Math.max(0, sections.findIndex((section) => section.id === active))

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
          {/*
            La lista entera, desde `sm`. Los cinco items suman unos 470px y en
            un teléfono hay 312: abajo de ese ancho va el paso a paso.
          */}
          <ul className="hidden flex-1 gap-1 sm:flex">
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
            El paso a paso del teléfono.

            Antes la lista scrolleaba de costado, que es la peor opción de las
            dos: en un teléfono no se dibuja barra de scroll, así que las tres
            secciones que quedaban afuera no existían. Acá siempre se ve en cuál
            estás y las dos flechas llevan a la anterior y a la siguiente.

            El nombre sale del mismo scroll-spy que pinta la lista de arriba, o
            sea que se actualiza solo mientras se scrollea.
          */}
          <div className="flex flex-1 items-center gap-1 sm:hidden">
            <Step section={sections[current - 1]} direction="prev" />
            <a
              href={`#${sections[current]?.id ?? ''}`}
              aria-current={active ? 'true' : undefined}
              className="min-w-0 flex-1 truncate border-2 border-accent bg-accent-dim px-2 py-1 text-center text-xs font-bold uppercase tracking-wide text-accent"
            >
              {sections[current]?.label}
            </a>
            <Step section={sections[current + 1]} direction="next" />
          </div>

          {/*
            La flechita hacia abajo. La portada ocupa la pantalla entera, así que
            sin esto no queda ninguna señal de que abajo siga habiendo algo.
            Lleva a la primera sección, la misma del primer item: es un gesto, no
            un atajo distinto. Se apaga apenas la barra se ancla, que es cuando
            ya se entendió que la página sigue.

            En el teléfono no va: ese papel lo hace la flecha derecha del paso a
            paso, y tres flechas en 312px es ruido.
          */}
          {sections.length > 0 && (
            <a
              href={`#${sections[0].id}`}
              aria-label="Bajar al contenido"
              className={`hidden shrink-0 border-2 border-transparent p-1 text-accent transition-opacity duration-200 hover:bg-accent-dim/60 hover:text-accent-soft sm:block ${
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

/**
 * Una de las dos flechas del paso a paso.
 *
 * Cuando no hay a dónde ir —la primera y la última sección— queda apagada en
 * vez de desaparecer: si se fuera, el nombre del medio se correría de lugar en
 * cada paso y la barra bailaría.
 */
function Step({ section, direction }: { section: NavSection | undefined; direction: 'prev' | 'next' }) {
  // p-2.5 y no p-1: sobre un ícono de 16px, el blanco quedaba en 24px, que es
  // el piso justo de WCAG 2.5.8. Con esto son 36 y siguen entrando al lado del
  // nombre de la sección en 390px.
  const shared = 'shrink-0 border-2 border-transparent p-2.5 text-accent'

  if (!section) {
    return (
      <span className={`${shared} opacity-25`} aria-hidden>
        <Chevron direction={direction} />
      </span>
    )
  }

  return (
    <a
      href={`#${section.id}`}
      aria-label={`${direction === 'prev' ? 'Anterior' : 'Siguiente'}: ${section.label}`}
      className={`${shared} transition-colors hover:bg-accent-dim/60 hover:text-accent-soft`}
    >
      <Chevron direction={direction} />
    </a>
  )
}

function Chevron({ direction }: { direction: 'prev' | 'next' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4"
      aria-hidden
    >
      <path d={direction === 'prev' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
    </svg>
  )
}
