'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { sortRows, type SortDirection, type SortOrder } from '@/lib/table/sort'

/**
 * A table that sorts on a header click, like gol.gg.
 *
 * WHY THIS IS A CLIENT COMPONENT, when the rest of the site sorts through the
 * URL (`TeamOrderPicker`, `ScopeNav`). Because here there are ten columns and
 * not two options: sorting is something done several times in a row to compare,
 * and with the pages on `force-dynamic` every click would be a round trip to
 * the server. The initial order still comes from the URL and every change
 * updates it, so the link can be shared and opens the same table.
 *
 * AND IT UPDATES WITH `history.replaceState` AND NOT WITH `router.replace`: the
 * latter asks the server for the page again and the sort stops being instant,
 * which is exactly what this came to solve. Next supports the URL changing
 * underneath without re-running anything.
 *
 * MIND HOW YOU MOUNT IT. `cell` and `sort` are functions, and a function does
 * not cross the server/client boundary: this can ONLY be mounted from another
 * component carrying `'use client'`. Mounting it straight from a page gives a
 * Next error that says nothing about any of this ("Functions cannot be passed
 * directly to Client Components"). That is why each table has its own client
 * file defining its columns inside.
 */

export interface Column<T> {
  /** The id that travels in `?orden=`. */
  id: string
  label: string
  /** What the header means when it is abbreviated ("PR" = pick rate). */
  title?: string
  cell: (row: T) => ReactNode
  /** Which value it sorts by. Without this the column is not sortable. */
  sort?: (row: T) => number | string | null
  align?: 'left' | 'right'
  /** Which way the first click sorts. Numbers start on `desc`. */
  firstClick?: SortDirection
}

/*
  Tailwind reads the source text: a class assembled at runtime (`text-${align}`)
  does not exist in the final CSS and the column comes out misaligned with no
  error at all. They go in whole in a map, like the TONE in AssignMatch.
*/
const ALIGN = {
  left: 'text-left',
  right: 'text-right',
} as const

export function SortableTable<T>({
  columns,
  rows,
  rowKey,
  initial,
  tiebreak,
  caption,
  params = { order: 'orden', dir: 'dir' },
  minWidth = 'min-w-[52rem]',
  emptyText = 'No hay nada para mostrar en este recorte.',
}: {
  columns: Column<T>[]
  rows: T[]
  /** React's `key` for each row. */
  rowKey: (row: T) => string
  initial: SortOrder
  /** How ties are resolved. Always required: see `sortRows`. */
  tiebreak: (a: T, b: T) => number
  /** The table's name for anyone navigating with a screen reader. */
  caption: string
  /**
   * Which parameters the order travels under in the URL.
   *
   * Every table needs its own: on a page with three of them, if they all wrote
   * `?orden=` they would trample each other and sorting the players would leave
   * the champions in an order their own table does not have.
   */
  params?: { order: string; dir: string }
  /** Minimum-width class, literal: `min-w-[64rem]`. See the note above. */
  minWidth?: string
  emptyText?: string
}) {
  const [order, setOrder] = useState<SortOrder>(initial)

  const sorted = useMemo(() => {
    const column = columns.find((c) => c.id === order.id)
    if (!column?.sort) return rows

    return sortRows(rows, column.sort, order.dir, tiebreak)
    // `columns` and `tiebreak` are redefined on every render of the wrapper;
    // what actually changes the result are the rows and the order.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, order])

  function sortBy(column: Column<T>) {
    const dir: SortDirection =
      column.id === order.id
        ? order.dir === 'asc'
          ? 'desc'
          : 'asc'
        : (column.firstClick ?? 'desc')

    setOrder({ id: column.id, dir })

    const url = new URL(window.location.href)
    url.searchParams.set(params.order, column.id)
    url.searchParams.set(params.dir, dir)
    window.history.replaceState(null, '', url)
  }

  if (rows.length === 0) {
    return (
      <p className="border-2 border-dashed border-line-strong px-6 py-10 text-center text-sm text-muted">
        {emptyText}
      </p>
    )
  }

  return (
    // `tabla-scroll` paints a gradient on the edges that only shows when there
    // is table left on that side: a phone draws no scrollbar and without this
    // nothing says the table continues. See globals.css.
    <div className="tabla-scroll overflow-x-auto border-2 border-line">
      <table className={`w-full text-sm ${minWidth}`}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b-2 border-line-strong bg-surface text-xs text-faint">
            {columns.map((column, index) => {
              const active = column.id === order.id
              const alignment = ALIGN[column.align ?? 'right']
              // See `.columna-orden` in globals.css. Never the first one: it
              // carries its own background because it stays pinned.
              const tint = active && index > 0 ? 'columna-orden' : ''

              return (
                <th
                  key={column.id}
                  scope="col"
                  title={column.title}
                  aria-sort={
                    active ? (order.dir === 'asc' ? 'ascending' : 'descending') : undefined
                  }
                  /*
                    The first column stays pinned when scrolling sideways.
                    Without this, on a phone you shift over to see DPM and the
                    player column has already left the screen: you end up
                    reading numbers without knowing whose they are. It needs a
                    background of its own - the row's does not cover it - which
                    is why `bg-surface` is spelled out.
                  */
                  className={`px-2 py-2 font-medium first:sticky first:left-0 first:z-10 first:bg-surface first:pl-3 last:pr-3 ${alignment} ${tint}`}
                >
                  {column.sort ? (
                    <button
                      type="button"
                      onClick={() => sortBy(column)}
                      aria-label={`Ordenar por ${column.label}`}
                      /*
                        The `-m-2 p-2` moves the th's padding onto the button
                        without shifting anything: the tappable area goes from
                        the 16px the text measures to 32, which is what
                        WCAG 2.5.8 asks for. The th still looks the same.
                      */
                      className={`group -m-2 inline-flex items-center gap-1 p-2 uppercase tracking-wide transition-colors hover:text-accent ${
                        active ? 'text-accent' : ''
                      } ${column.align === 'left' ? 'flex-row' : 'flex-row-reverse'}`}
                    >
                      <SortArrow active={active} dir={order.dir} />
                      {column.label}
                    </button>
                  ) : (
                    <span className="uppercase tracking-wide">{column.label}</span>
                  )}
                </th>
              )
            })}
          </tr>
        </thead>

        <tbody className="divide-y divide-line">
          {sorted.map((row) => (
            // `hover:bg-raised` and not `bg-surface/60`: over the dark canvas,
            // surface at 60% gave a four-point difference in luminance, which
            // is to say none. In a fourteen-column table, following a row with
            // your eyes is precisely the hardest part. `raised` exists for this
            // and it is the same hover StatCard uses.
            //
            // `group` is so the pinned cell on the left - which carries its own
            // background - follows the hover instead of staying put.
            <tr key={rowKey(row)} className="group hover:bg-raised">
              {columns.map((column, index) => (
                <td
                  key={column.id}
                  className={`px-2 py-2 first:sticky first:left-0 first:z-10 first:bg-canvas group-hover:first:bg-raised first:pl-3 last:pr-3 ${
                    ALIGN[column.align ?? 'right']
                  } ${column.align === 'left' ? '' : 'tabular'} ${
                    column.id === order.id && index > 0 ? 'columna-orden' : ''
                  }`}
                >
                  {column.cell(row)}
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
 * The header arrow.
 *
 * On the columns that are not sorting it stays invisible until the mouse or the
 * focus passes over: if all ten showed at once the header would be a row of
 * arrows and none of them would say anything, but if they were never there
 * there would be no way to tell the table can be sorted at all.
 *
 * EXCEPT WHERE THERE IS NO MOUSE. On a phone that hover never arrives, so the
 * only sign that the table sorts did not exist: the view's main feature was
 * invisible on exactly the device it is opened on most. The `flecha-orden`
 * class is what hooks the `@media (hover: none)` rule in globals.css, which
 * leaves them at half opacity there from the start.
 */
function SortArrow({ active, dir }: { active: boolean; dir: SortDirection }) {
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden="true"
      className={`h-2.5 w-2.5 shrink-0 transition-opacity ${
        active
          ? 'opacity-100'
          : 'flecha-orden opacity-0 group-hover:opacity-50 group-focus-visible:opacity-50'
      } ${active && dir === 'asc' ? 'rotate-180' : ''}`}
    >
      <path d="M6 9L1.5 3.75h9L6 9z" fill="currentColor" />
    </svg>
  )
}
