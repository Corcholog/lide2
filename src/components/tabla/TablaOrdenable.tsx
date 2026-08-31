'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { ordenar, type Direccion, type Orden } from '@/lib/tabla/orden'

/**
 * Una tabla que se ordena haciendo clic en el encabezado, como gol.gg.
 *
 * POR QUE ES UN COMPONENTE DE CLIENTE, cuando el resto del sitio ordena por la
 * URL (`OrdenEquipos`, `ScopeNav`). Porque acá son diez columnas y no dos
 * opciones: ordenar es algo que se hace varias veces seguidas para comparar, y
 * con las páginas en `force-dynamic` cada clic sería un viaje al servidor. El
 * orden inicial igual sale de la URL y cada cambio la actualiza, así que el
 * link se puede compartir y abre la tabla igual.
 *
 * Y SE ACTUALIZA CON `history.replaceState` Y NO CON `router.replace`: lo
 * segundo vuelve a pedirle la página al servidor y el orden deja de ser
 * instantáneo, que es justo lo que se venía a resolver. Next soporta que la URL
 * cambie por abajo sin re-ejecutar nada.
 *
 * OJO AL USARLA. `cell` y `sort` son funciones, y una función no cruza el borde
 * entre servidor y cliente: esto SOLO se puede montar desde otro componente con
 * `'use client'`. Montarla directo desde una página da un error de Next que no
 * dice nada de esto ("Functions cannot be passed directly to Client
 * Components"). Por eso cada tabla tiene su propio archivo de cliente que
 * define sus columnas ahí adentro.
 */

export interface Columna<T> {
  /** El id que viaja en `?orden=`. */
  id: string
  label: string
  /** Qué significa el encabezado cuando está abreviado ("PR" = pick rate). */
  title?: string
  cell: (fila: T) => ReactNode
  /** Por qué valor ordena. Sin esto la columna no es ordenable. */
  sort?: (fila: T) => number | string | null
  align?: 'left' | 'right'
  /** Hacia dónde ordena el primer clic. Los números arrancan en `desc`. */
  primero?: Direccion
}

/*
  Tailwind lee el texto del fuente: una clase armada en runtime (`text-${align}`)
  no existe en el CSS final y la columna sale desalineada sin ningún error. Van
  enteras en un mapa, como el TONE de AssignMatch.
*/
const ALIGN = {
  left: 'text-left',
  right: 'text-right',
} as const

export function TablaOrdenable<T>({
  columnas,
  filas,
  clave,
  inicial,
  desempate,
  caption,
  params = { orden: 'orden', dir: 'dir' },
  minWidth = 'min-w-[52rem]',
  vacia = 'No hay nada para mostrar en este recorte.',
}: {
  columnas: Columna<T>[]
  filas: T[]
  /** La `key` de React de cada fila. */
  clave: (fila: T) => string
  inicial: Orden
  /** Cómo se resuelven los empates. Siempre hace falta: ver `ordenar`. */
  desempate: (a: T, b: T) => number
  /** Nombre de la tabla para quien navega con lector de pantalla. */
  caption: string
  /**
   * Con qué parámetros viaja el orden en la URL.
   *
   * Cada tabla necesita los suyos: en una página con tres, si todas escribieran
   * `?orden=` se pisarían entre sí y ordenar los jugadores dejaría a los
   * campeones con un orden que su tabla no tiene.
   */
  params?: { orden: string; dir: string }
  /** Clase de ancho mínimo, literal: `min-w-[64rem]`. Ver la nota de arriba. */
  minWidth?: string
  vacia?: string
}) {
  const [orden, setOrden] = useState<Orden>(inicial)

  const ordenadas = useMemo(() => {
    const columna = columnas.find((c) => c.id === orden.id)
    if (!columna?.sort) return filas

    return ordenar(filas, columna.sort, orden.dir, desempate)
    // `columnas` y `desempate` se redefinen en cada render del wrapper; lo que
    // de verdad cambia el resultado son las filas y el orden.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas, orden])

  function ordenarPor(columna: Columna<T>) {
    const dir: Direccion =
      columna.id === orden.id
        ? orden.dir === 'asc'
          ? 'desc'
          : 'asc'
        : (columna.primero ?? 'desc')

    setOrden({ id: columna.id, dir })

    const url = new URL(window.location.href)
    url.searchParams.set(params.orden, columna.id)
    url.searchParams.set(params.dir, dir)
    window.history.replaceState(null, '', url)
  }

  if (filas.length === 0) {
    return (
      <p className="border-2 border-dashed border-line-strong px-6 py-10 text-center text-sm text-muted">
        {vacia}
      </p>
    )
  }

  return (
    <div className="overflow-x-auto border-2 border-line">
      <table className={`w-full text-sm ${minWidth}`}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b-2 border-line-strong bg-surface text-xs text-faint">
            {columnas.map((columna) => {
              const activa = columna.id === orden.id
              const alineacion = ALIGN[columna.align ?? 'right']

              return (
                <th
                  key={columna.id}
                  scope="col"
                  title={columna.title}
                  aria-sort={
                    activa ? (orden.dir === 'asc' ? 'ascending' : 'descending') : undefined
                  }
                  className={`px-2 py-2 font-medium first:pl-3 last:pr-3 ${alineacion}`}
                >
                  {columna.sort ? (
                    <button
                      type="button"
                      onClick={() => ordenarPor(columna)}
                      aria-label={`Ordenar por ${columna.label}`}
                      className={`group inline-flex items-center gap-1 uppercase tracking-wide transition-colors hover:text-accent ${
                        activa ? 'text-accent' : ''
                      } ${columna.align === 'left' ? 'flex-row' : 'flex-row-reverse'}`}
                    >
                      <Flecha activa={activa} dir={orden.dir} />
                      {columna.label}
                    </button>
                  ) : (
                    <span className="uppercase tracking-wide">{columna.label}</span>
                  )}
                </th>
              )
            })}
          </tr>
        </thead>

        <tbody className="divide-y divide-line">
          {ordenadas.map((fila) => (
            <tr key={clave(fila)} className="hover:bg-surface/60">
              {columnas.map((columna) => (
                <td
                  key={columna.id}
                  className={`px-2 py-2 first:pl-3 last:pr-3 ${ALIGN[columna.align ?? 'right']} ${
                    columna.align === 'left' ? '' : 'tabular'
                  }`}
                >
                  {columna.cell(fila)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * La flecha del encabezado.
 *
 * En las columnas que no están ordenando queda invisible hasta que el mouse o
 * el foco pasan por encima: si se vieran las diez a la vez el encabezado sería
 * una hilera de flechas y ninguna diría nada, pero si no estuvieran nunca no
 * habría forma de darse cuenta de que la tabla se puede ordenar.
 */
function Flecha({ activa, dir }: { activa: boolean; dir: Direccion }) {
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden="true"
      className={`h-2.5 w-2.5 shrink-0 transition-opacity ${
        activa ? 'opacity-100' : 'opacity-0 group-hover:opacity-50 group-focus-visible:opacity-50'
      } ${activa && dir === 'asc' ? 'rotate-180' : ''}`}
    >
      <path d="M6 9L1.5 3.75h9L6 9z" fill="currentColor" />
    </svg>
  )
}
