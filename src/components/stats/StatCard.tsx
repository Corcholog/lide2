/* eslint-disable @next/next/no-img-element */

import Link from 'next/link'
import type { ReactNode } from 'react'
import type { StatBlock, StatRow } from '@/lib/stats/types'

/**
 * One stat card: title, up to five rows and an optional note. Every stat uses
 * it, so new stats need no page changes.
 */
export function StatCard({ block }: { block: StatBlock }) {
  return (
    <section className="flex flex-col border-2 border-line bg-surface text-fg">
      {/*
        Red title band, so each ranking is easy to find in a long grid. `accent`
        on `accent-dim` meets AA in both themes.
      */}
      <header className="border-b-2 border-accent bg-accent-dim px-4 py-3">
        <h3 className="font-display text-sm uppercase tracking-wide text-accent">{block.title}</h3>
        {block.subtitle && <p className="mt-0.5 text-xs text-muted">{block.subtitle}</p>}
      </header>

      <ol className="flex flex-1 flex-col divide-y divide-line">
        {block.rows.map((row, index) => (
          <li key={row.id}>
            <Row row={row} index={index} />
          </li>
        ))}
      </ol>

      {block.note && (
        <p className="border-t-2 border-line px-4 py-2 text-xs text-faint">{block.note}</p>
      )}
    </section>
  )
}

/** A row, linked as a whole when it has a destination (a larger tap target). */
function Row({ row, index }: { row: StatRow; index: number }) {
  const content = <RowContent row={row} index={index} />

  if (!row.href) {
    return <div className="flex items-center gap-3 px-4 py-2.5">{content}</div>
  }

  return (
    <Link
      href={row.href}
      className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-raised"
    >
      {content}
    </Link>
  )
}

function RowContent({ row, index }: { row: StatRow; index: number }): ReactNode {
  /*
    Layout: the 48px icon sets the row height, and the text (name plus one line)
    fits within it, so everything stays vertically centered. Subtitle and detail
    are separate lines, so a long university name truncates on its own without
    cutting the short detail.
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
        Square with a border, like the crests in the standings table: the site
        uses no rounded corners, and the border outlines white-backed crests on
        the light theme.
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
          Up to two lines, for long university names; `line-clamp` only grows
          the rows that need it.
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

      {/*
        The ranked value is red, as in the standings table. The leader is bold
        `accent`; the rest use `accent-soft`, which passes AA on `surface`.
      */}
      <span
        className={`shrink-0 text-right text-sm tabular-nums ${
          index === 0 ? 'font-bold text-accent' : 'text-accent-soft'
        }`}
      >
        {row.display}
      </span>
    </>
  )
}
