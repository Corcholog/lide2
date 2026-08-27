'use client'

import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

/**
 * El fixture en pestañas, una por fecha.
 *
 * Antes se veían las tres fechas seguidas, una abajo de la otra. Con los grupos
 * en dos columnas eso son seis filas de grupos y la portada se volvía un
 * scroll interminable donde el fixture tapaba todo lo que venía después. Se ve
 * una fecha por vez y las otras están a un botón.
 *
 * LOS PANELES NO SE DESMONTAN. Los tres están siempre en el DOM: el que se ve
 * va en el flujo normal y los otros quedan en `absolute`, transparentes y con
 * `inert`. Es a propósito y por dos razones.
 *
 * La primera es que el árbol del fixture lo dibuja el servidor y viaja hasta acá
 * como `children`; si se montara y desmontara con cada clic, React tendría que
 * rehacer las dieciséis filas de cada fecha. Es la misma decisión que ya toma
 * TeamFocus, que resalta equipos con CSS justamente para no re-renderizar esto.
 *
 * La segunda es la altura. Con los paneles apilados en `absolute`, el alto de la
 * caja lo fija el que se ve y nada más, así que la fecha 3 —que tiene un turno
 * en vez de dos— no arrastra el hueco de las otras dos. Una cinta que se
 * desplaza en horizontal, que es la otra forma de hacer esto, mide siempre lo
 * que el panel más alto y habría que medir y animar el alto a mano.
 *
 * `inert` es lo que hace que los paneles escondidos no existan para el teclado
 * ni para un lector de pantalla. Sin eso, tabulando desde la última fila de la
 * fecha 1 se cae adentro de la fecha 2, que está ahí pero no se ve.
 */

/*
 * Las clases van enteras y literales, y no armadas con un template. Tailwind
 * genera el CSS leyendo el texto de los archivos: si la clase se arma en
 * tiempo de ejecucion, el nombre completo no aparece nunca en el fuente y la
 * regla no se emite. Se veria el cambio de panel, pero sin animacion.
 */
const ENTRA_IZQ = 'motion-safe:animate-[entra-izq_.28s_ease-out]'
const ENTRA_DER = 'motion-safe:animate-[entra-der_.28s_ease-out]'

export interface Fecha {
  /** El número que se ve en el botón. */
  matchday: number
  /** "sábado 5 de septiembre", debajo del número. */
  cuando: string
  /** "8 jugados de 16", o null si todavía no se jugó ninguno. */
  detalle: string | null
}

export function FixtureFechas({
  fechas,
  children,
}: {
  fechas: Fecha[]
  /** Un panel por fecha, en el mismo orden. */
  children: ReactNode[]
}) {
  const [actual, setActual] = useState(0)
  // Hacia dónde entra el panel nuevo: a la izquierda si vamos hacia adelante.
  const [haciaAdelante, setHaciaAdelante] = useState(true)
  /*
   * La animación recién existe después del primer clic. Si no, la fecha 1
   * entraría animada al cargar la página: un movimiento que nadie pidió, en lo
   * único que se mueve de la portada, y que además sale en el HTML del
   * servidor. Es una transición entre fechas, no una entrada.
   */
  const [movido, setMovido] = useState(false)
  const tabs = useRef<HTMLDivElement>(null)
  const toque = useRef<{ x: number; y: number } | null>(null)

  function ir(destino: number, foco = false) {
    const i = Math.max(0, Math.min(fechas.length - 1, destino))
    if (i === actual) return
    setHaciaAdelante(i > actual)
    setActual(i)
    setMovido(true)
    if (foco) {
      tabs.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[i]?.focus()
    }
  }

  // Flechas para moverse entre pestañas: es lo que espera cualquiera que llegue
  // a una con el teclado, y no cuesta nada.
  function teclas(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowRight') ir(actual + 1, true)
    else if (event.key === 'ArrowLeft') ir(actual - 1, true)
    else if (event.key === 'Home') ir(0, true)
    else if (event.key === 'End') ir(fechas.length - 1, true)
    else return
    event.preventDefault()
  }

  /*
   * Arrastrar con el dedo. El umbral de 50px y la comparación contra el
   * movimiento vertical son para no robarle el gesto al scroll: si el dedo bajó
   * más de lo que se movió al costado, la persona está scrolleando la página y
   * no cambiando de fecha.
   */
  function fin(x: number, y: number) {
    const inicio = toque.current
    toque.current = null
    if (!inicio) return
    const dx = x - inicio.x
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(y - inicio.y)) return
    ir(actual + (dx < 0 ? 1 : -1))
  }

  return (
    <>
      <div
        ref={tabs}
        role="tablist"
        aria-label="Fechas del fixture"
        onKeyDown={teclas}
        className="flex flex-wrap gap-0.5 bg-line p-0.5"
      >
        {fechas.map((fecha, i) => {
          const activa = i === actual
          return (
            <button
              key={fecha.matchday}
              type="button"
              role="tab"
              id={`fecha-tab-${fecha.matchday}`}
              aria-selected={activa}
              aria-controls={`fecha-panel-${fecha.matchday}`}
              // Un solo tab stop en toda la barra: se entra con Tab y se
              // recorre con las flechas.
              tabIndex={activa ? 0 : -1}
              onClick={() => ir(i)}
              className={`flex-1 cursor-pointer px-4 py-2 text-left transition-colors ${
                activa ? 'bg-accent-strong text-white' : 'bg-surface text-muted hover:text-fg'
              }`}
            >
              <span className="block text-sm font-bold uppercase tracking-tight">
                Fecha {fecha.matchday}
              </span>
              <span
                className={`block truncate text-[11px] ${activa ? 'text-white/75' : 'text-faint'}`}
              >
                {fecha.detalle ?? fecha.cuando}
              </span>
            </button>
          )
        })}
      </div>

      <div
        className="relative overflow-hidden"
        onTouchStart={(e) =>
          (toque.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })
        }
        onTouchEnd={(e) => fin(e.changedTouches[0].clientX, e.changedTouches[0].clientY)}
      >
        {children.map((panel, i) => {
          const activa = i === actual
          return (
            <div
              key={fechas[i]?.matchday ?? i}
              role="tabpanel"
              id={`fecha-panel-${fechas[i]?.matchday ?? i}`}
              aria-labelledby={`fecha-tab-${fechas[i]?.matchday ?? i}`}
              inert={!activa}
              className={
                activa
                  ? // La animación arranca sola al aparecer la clase, porque el
                    // panel venía sin ninguna. Cambiar de dirección tambien la
                    // reinicia, que es lo que se quiere al ir y volver.
                    !movido
                      ? ''
                      : haciaAdelante
                        ? ENTRA_IZQ
                        : ENTRA_DER
                  : 'pointer-events-none absolute inset-x-0 top-0 opacity-0'
              }
            >
              {panel}
            </div>
          )
        })}
      </div>
    </>
  )
}
