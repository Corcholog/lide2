import Link from 'next/link'
import type { MouseEventHandler } from 'react'

/**
 * The site's filter chip.
 *
 * A `<Link>` because filters live in the URL: pages stay server components,
 * filtered views can be shared, and it works without JavaScript. `prefetch` and
 * `onClick` are set by the caller (see `ScopeNav`): prefetch for server-rendered
 * pages, and a click handler that updates the URL when the page already has the
 * data.
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
      // py-2 gives a 38px tap target (WCAG 2.5.8 asks for at least 24px).
      // shrink-0 and whitespace-nowrap: below `sm` the bar scrolls sideways,
      // and chips must not shrink or wrap their text.
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
