/* eslint-disable @next/next/no-img-element */

import Link from 'next/link'
import type { ReactNode } from 'react'
import type { StatBlock, StatRow } from '@/lib/stats/types'

/**
 * Una estadística: título, hasta cinco filas y, si hace falta, una aclaración.
 *
 * Todas las estadísticas se dibujan con esto, así que el catálogo puede crecer
 * sin tocar la página. El puesto va en número grande a la izquierda y el valor
 * a la derecha, que es como se lee un ranking de un vistazo.
 */
export function StatCard({ block }: { block: StatBlock }) {
  return (
    <section className="flex flex-col border-2 border-line bg-surface text-fg">
      <header className="border-b-2 border-line px-4 py-3">
        <h3 className="font-display text-sm uppercase tracking-wide">{block.title}</h3>
        {block.subtitle && <p className="mt-0.5 text-xs text-muted">{block.subtitle}</p>}
      </header>

      <ol className="flex flex-1 flex-col divide-y divide-line">
        {block.rows.map((row, index) => (
          <li key={row.id}>
            <Fila row={row} index={index} />
          </li>
        ))}
      </ol>

      {block.note && (
        <p className="border-t-2 border-line px-4 py-2 text-xs text-faint">{block.note}</p>
      )}
    </section>
  )
}

/**
 * La fila, que es un link cuando hay a dónde ir.
 *
 * El `<a>` envuelve la fila entera y no sólo el nombre: en una lista de cinco
 * renglones, un blanco de destino de 90px de ancho es incómodo de acertar, y
 * más en un teléfono.
 */
function Fila({ row, index }: { row: StatRow; index: number }) {
  const contenido = <Contenido row={row} index={index} />

  if (!row.href) {
    return <div className="flex items-center gap-3 px-4 py-2.5">{contenido}</div>
  }

  return (
    <Link
      href={row.href}
      className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-raised"
    >
      {contenido}
    </Link>
  )
}

function Contenido({ row, index }: { row: StatRow; index: number }): ReactNode {
  /*
    LAS ALTURAS DE LA FILA, que es lo que la hace ver alineada o no.

    El ícono es la referencia: 48px. El texto entra entero adentro de esa
    altura —nombre (20px) más la línea de abajo (16px) dan 36— y con todo
    centrado el retrato del campeón queda a la par de su nombre en vez de
    flotar contra un bloque más alto. El aire que sobra es a propósito: la cara
    del campeón es lo que se reconoce de un vistazo, y a 36px era una mancha.

    Debajo del nombre van DOS RENGLONES SEPARADOS y no uno solo con las dos
    cosas unidas por un `·`. Esa unión era el problema: en universidades daba
    "Universidad Nacional de José C. Paz · 18-10 en 28 apariciones", sesenta
    caracteres para los treinta y uno que entran por renglón en la grilla de
    tres columnas. Con dos líneas quedaba al borde y se cortaba en algunas sí y
    en otras no, según el largo del nombre.

    Separados, cada uno se corta por su cuenta: el detalle —corto siempre— se
    lee entero, y lo único que puede quedar con puntos suspensivos es el nombre
    largo, que además va completo en el `title`. La altura no cambia: dos
    renglones de uno miden lo mismo que uno de dos.
  */


  return (
    <>
      <span
        className={`w-4 shrink-0 font-display text-sm ${
          index === 0 ? 'text-accent' : 'text-faint'
        }`}
      >
        {index + 1}
      </span>

      {/*
        Cuadrado y con borde, como los escudos de la tabla de posiciones
        (`LogoUniversidad`): el sitio tiene todos los radios en cero, y un
        ícono redondeado en el medio de una grilla de esquinas rectas se lee
        como si fuera de otra página. El borde además le da forma al escudo,
        que es un PNG de fondo blanco y sobre tema claro se fusionaría con la
        tarjeta.
      */}
      {row.logo && (
        <img
          src={row.logo}
          alt=""
          width={256}
          height={256}
          loading="lazy"
          className="size-12 shrink-0 border border-line bg-raised object-contain"
        />
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={row.name}>
          {row.name}
        </p>
        {/*
          Hasta dos renglones: los nombres de universidad no entran en uno
          ("Universidad Nacional de José C. Paz") y el resto de las tarjetas usa
          este lugar para el equipo o el rol, que entran de sobra en uno solo.
          Como es `line-clamp` y no una altura fija, la fila sólo crece donde
          hace falta.
        */}
        {row.subtitle && (
          <p className="line-clamp-2 text-xs leading-4 text-muted" title={row.subtitle}>
            {row.subtitle}
          </p>
        )}
        {row.detail && (
          <p className="truncate text-xs leading-4 text-faint" title={row.detail}>
            {row.detail}
          </p>
        )}
      </div>

      <span
        className={`shrink-0 text-right text-sm tabular-nums ${
          index === 0 ? 'font-bold text-accent' : 'text-fg-soft'
        }`}
      >
        {row.display}
      </span>
    </>
  )
}
