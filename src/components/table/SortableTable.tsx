'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { sortRows, type SortDirection, type SortOrder } from '@/lib/table/sort'

/**
 * A table sorted by clicking column headers.
 *
 * Sorting happens on the client, unlike the site's other URL-driven filters:
 * people sort repeatedly to compare, and these pages are `force-dynamic`, so a
 * server round trip per click would be slow. The initial order comes from the
 * URL and each change is written back with `history.replaceState` (not
 * `router.replace`, which would refetch the page), so links stay shareable.
 *
 * `cell` and `sort` are functions, which cannot cross the server/client
 * boundary, so this must be rendered from a client component. That is why each
 * table has its own client file defining its columns.
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
 * Full class names in a map: Tailwind cannot see classes assembled at runtime
 * (`text-${align}`).
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
   * URL parameter names for the order. Each table on a page needs its own, or
   * sorting one would overwrite the others.
   */
  params?: { order: string; dir: string }
  /** Minimum width as a literal class, e.g. `min-w-[64rem]` (see ALIGN above). */
  minWidth?: string
  emptyText?: string
}) {
  const [picked, setPicked] = useState<SortOrder>(initial)
  // A column can disappear while its sort is still picked (the ban columns
  // when a role is selected): fall back to the order the URL asked for.
  const order = columns.some((c) => c.id === picked.id) ? picked : initial

  const sorted = useMemo(() => {
    const column = columns.find((c) => c.id === order.id)
    if (!column?.sort) return rows

    return sortRows(rows, column.sort, order.dir, tiebreak)
  }, [rows, order, columns, tiebreak])

  function sortBy(column: Column<T>) {
    const dir: SortDirection =
      column.id === order.id
        ? order.dir === 'asc'
          ? 'desc'
          : 'asc'
        : (column.firstClick ?? 'desc')

    setPicked({ id: column.id, dir })

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
    // `tabla-scroll` shows an edge shadow while there is more table to scroll
    // (see globals.css).
    <div className="tabla-scroll overflow-x-auto border-2 border-line">
      <table className={`w-full text-sm ${minWidth}`}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b-2 border-line-strong bg-surface text-xs text-faint">
            {columns.map((column, index) => {
              const active = column.id === order.id
              const alignment = ALIGN[column.align ?? 'right']
              // See `.columna-orden` in globals.css. The pinned first column
              // keeps its own background.
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
                    The first column stays pinned when scrolling sideways, so the
                    row's name stays visible. It needs its own background.
                  */
                  className={`px-2 py-2 font-medium first:sticky first:left-0 first:z-10 first:bg-surface first:pl-3 last:pr-3 ${alignment} ${tint}`}
                >
                  {column.sort ? (
                    <button
                      type="button"
                      onClick={() => sortBy(column)}
                      aria-label={`Ordenar por ${column.label}`}
                      /*
                        `-m-2 p-2` moves the padding onto the button, making the
                        tap target 32px (WCAG 2.5.8) without changing the layout.
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
            // `hover:bg-raised` gives visible contrast on the dark theme (the
            // same hover as StatCard). `group` lets the pinned first cell follow
            // the row hover.
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
 * The header sort arrow. Inactive arrows appear on hover or focus; on touch
 * screens `flecha-orden` keeps them half visible (see globals.css).
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
