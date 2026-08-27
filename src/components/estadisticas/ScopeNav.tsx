import Link from 'next/link'
import { MATCHDAYS } from '@/lib/stats/scope'

/**
 * El selector de fecha, compartido por /estadisticas y /admin/cards.
 *
 * `base` es la ruta de cada una; el resto —qué fechas hay y cómo se llaman—
 * sale del calendario, igual que el recorte.
 */
export function ScopeNav({ base, matchday }: { base: string; matchday: number | null }) {
  return (
    <nav aria-label="Recorte" className="flex flex-wrap gap-1">
      <ScopeLink label="Toda la fase" href={base} active={matchday === null} />
      {MATCHDAYS.map((entry) => (
        <ScopeLink
          key={entry.matchday}
          label={entry.label}
          href={`${base}?fecha=${entry.matchday}`}
          active={matchday === entry.matchday}
        />
      ))}
    </nav>
  )
}

function ScopeLink({ label, href, active }: { label: string; href: string; active: boolean }) {
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
