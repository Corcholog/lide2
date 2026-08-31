import Link from 'next/link'
import type { TeamOrder } from '@/lib/teams/order'

/**
 * Cómo se ordena la lista de equipos.
 *
 * Dos links y no un `<select>` con estado: el orden viaja en la URL, así que la
 * página sigue siendo un componente de servidor, el orden se puede compartir
 * pegando el link y funciona sin JavaScript. Mismo mecanismo que el selector de
 * fecha de /estadisticas (`ScopeNav`).
 */
export function OrdenEquipos({ order }: { order: TeamOrder }) {
  return (
    <nav aria-label="Orden" className="flex gap-1">
      <OrdenLink label="A–Z" href="/equipos" active={order === 'alfabetico'} />
      <OrdenLink label="Winrate" href="/equipos?orden=winrate" active={order === 'winrate'} />
    </nav>
  )
}

function OrdenLink({ label, href, active }: { label: string; href: string; active: boolean }) {
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
