/* eslint-disable @next/next/no-img-element */

import Link from 'next/link'
import type { ReactNode } from 'react'
import type { StatBlock, StatRow } from '@/lib/stats/types'

/**
 * One stat: a title, up to five rows and, where needed, a caveat.
 *
 * Every stat is drawn with this, so the catalogue can grow without touching the
 * page. The place goes in a large number on the left and the value on the
 * right, which is how a ranking is read at a glance.
 */
export function StatCard({ block }: { block: StatBlock }) {
  return (
    <section className="flex flex-col border-2 border-line bg-surface text-fg">
      {/*
        THE TITLE BAND. Thirty-four cards in a three-column grid, all in the
        same greys, and the titles were the same size and colour as the rows
        underneath: scrolling past, nothing said where one ranking ended and
        the next began, and finding "Multikills" meant reading every heading.

        Red, tinted background and a red rule underneath - the same trio the
        active chip of the bans panel uses - turn the heading into a band that
        is found without reading it. The colour is `accent`, which is the one
        the palette already audited over `accent-dim`: 5.5:1 on the light theme
        and 4.96:1 on the dark, so it is a title anyone can read and not a
        decoration that only works if you can tell red from grey.
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

/**
 * The row, which is a link when there is somewhere to go.
 *
 * The `<a>` wraps the whole row and not just the name: in a list of five lines,
 * a 90px-wide target is awkward to hit, all the more on a phone.
 */
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
    THE ROW'S HEIGHTS, which is what makes it look aligned or not.

    The icon is the reference: 48px. The text fits entirely inside that height -
    name (20px) plus the line below it (16px) make 36 - and with everything
    centred the champion portrait sits level with its name instead of floating
    against a taller block. The leftover air is deliberate: the champion's face
    is what gets recognized at a glance, and at 36px it was a smudge.

    Below the name go TWO SEPARATE LINES and not one with both things joined by
    a `·`. That join was the problem: on universities it gave "Universidad
    Nacional de José C. Paz · 18-10 en 28 apariciones", sixty characters against
    the thirty-one that fit on a line in the three-column grid. Two lines left
    it right at the edge and it clipped on some and not others, depending on the
    length of the name.

    Kept apart, each clips on its own: the detail - always short - reads in
    full, and the only thing that can end in an ellipsis is a long name, which
    also travels complete in the `title`. The height does not change: two lines
    of one measure the same as one of two.
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
        Square and bordered, like the crests in the standings table
        (`UniversityLogo`): the site has every radius at zero, and a rounded
        icon in the middle of a grid of square corners reads as if it came from
        another page. The border also gives the crest a shape, since it is a
        white-backed PNG and over the light theme it would blend into the card.
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
          Up to two lines: university names do not fit on one ("Universidad
          Nacional de José C. Paz") and the rest of the cards use this spot for
          the team or the role, which fit on one with room to spare. Since it is
          `line-clamp` and not a fixed height, the row only grows where it has
          to.
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
        THE NUMBER, IN RED. It is the same rule as the standings table on the
        front page, where what a team won is `win` and what it lost is `dim`:
        on this site the figure that is being ranked is red, and the grey was
        making it read as one more line of context next to the name.

        The leader keeps the strong tone plus the bold; the other four go in
        `accent-soft`, which is a step apart in both themes and clears 4.5:1 on
        `surface` in each. So the ranking is still read off the colour and not
        only off the number on the left.
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
