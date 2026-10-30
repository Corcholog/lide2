import Link from 'next/link'
import { toggleClass } from '@/components/ui/Toggle'
import type { TeamOrder } from '@/lib/teams/order'

/**
 * Team list order links. Links rather than a stateful select: the order lives
 * in the URL, so it can be shared and works without JavaScript, like `ScopeNav`.
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
      className={toggleClass(active, 'px-3 py-1 text-xs font-bold uppercase tracking-wide')}
    >
      {label}
    </Link>
  )
}
