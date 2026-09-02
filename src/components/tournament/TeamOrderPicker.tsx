import Link from 'next/link'
import type { TeamOrder } from '@/lib/teams/order'

/**
 * How the team list is ordered.
 *
 * Two links and not a `<select>` with state: the order travels in the URL, so
 * the page stays a server component, the order can be shared by pasting the
 * link and it works without JavaScript. Same mechanism as the matchday picker
 * on /estadisticas (`ScopeNav`).
 */
export function TeamOrderPicker({ order }: { order: TeamOrder }) {
  return (
    <nav aria-label="Orden" className="flex gap-1">
      <OrderLink label="A–Z" href="/equipos" active={order === 'alfabetico'} />
      <OrderLink label="Winrate" href="/equipos?orden=winrate" active={order === 'winrate'} />
    </nav>
  )
}

function OrderLink({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'true' : undefined}
      className={`border-2 px-3 py-1 text-xs font-bold uppercase tracking-wide transition-colors ${
        active
          ? 'border-accent bg-accent-dim text-accent'
          : 'border-line text-muted hover:border-line-strong hover:text-accent'
      }`}
    >
      {label}
    </Link>
  )
}
