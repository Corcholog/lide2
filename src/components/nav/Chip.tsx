import Link from 'next/link'
import type { MouseEventHandler } from 'react'

/**
 * The site's filter chip.
 *
 * The markup was duplicated across `ScopeNav` and `TeamOrderPicker`; with the
 * tables tab it would have become four copies of the same thing, which is one
 * too many for them to keep looking alike without somebody remembering to touch
 * all four.
 *
 * It is a `<Link>` and not a button because the filter travels in the URL: the
 * page stays a server component, the scope can be shared by pasting the link
 * and it works without JavaScript.
 *
 * `prefetch` AND `onClick` ARE BOTH ABOUT THE WAIT after the click, and they
 * are the two answers to it. A chip whose page has to be asked for gets
 * `prefetch` - these pages are `force-dynamic`, and Next does not prefetch
 * those unless it is told to, so without it every chip is a round trip with the
 * visitor watching. A chip whose page is ALREADY IN THE BROWSER gets an
 * `onClick` that preventDefaults and writes the URL by hand instead. Neither is
 * this component's decision: see `ScopeNav`.
 */
export function Chip({
  label,
  href,
  active,
  prefetch,
  onClick,
}: {
  label: string
  href: string
  active: boolean
  prefetch?: boolean
  onClick?: MouseEventHandler<HTMLAnchorElement>
}) {
  return (
    <Link
      href={href}
      prefetch={prefetch}
      onClick={onClick}
      aria-current={active ? 'true' : undefined}
      // py-2 and not py-1: with `text-xs` the chip stood 26px tall and it is
      // the most-tapped control on the site - matchday, group, view and order,
      // across four pages. WCAG 2.5.8 asks for 24 and the iOS and Android
      // guidelines for 44; this lands on 38, which fits the line without
      // breaking the row apart.
      // shrink-0 and whitespace-nowrap: below `sm` the bar holding them
      // scrolls horizontally instead of wrapping, and without these the chips
      // shrink to fit and the text breaks across two lines.
      className={`shrink-0 whitespace-nowrap border-2 px-3 py-2 text-xs font-bold uppercase tracking-wide transition-colors ${
        active
          ? 'border-accent bg-accent-dim text-accent'
          : 'border-line text-muted hover:border-line-strong hover:text-accent'
      }`}
    >
      {label}
    </Link>
  )
}
