import { Chip } from '@/components/nav/Chip'
import { MATCHDAYS } from '@/lib/stats/scope'
import { conQuery } from '@/lib/url'

/**
 * El selector de fecha, compartido por /estadisticas, /estadisticas/tablas,
 * /partidas y /admin/cards.
 *
 * `base` es la ruta de cada una; el resto —qué fechas hay y cómo se llaman—
 * sale del calendario, igual que el recorte.
 *
 * `query` son los OTROS filtros de la página, que hay que arrastrar en cada
 * link: sin eso, elegir la fecha 2 en /partidas borra el equipo que estaba
 * filtrado, y en las tablas borra el grupo.
 */
export function ScopeNav({
  base,
  matchday,
  query = {},
}: {
  base: string
  matchday: number | null
  query?: Record<string, string | number | null | undefined>
}) {
  return (
    <nav aria-label="Recorte" className="flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:pb-0">
      <Chip
        label="Toda la fase"
        href={conQuery(base, { ...query, fecha: null })}
        active={matchday === null}
      />
      {MATCHDAYS.map((entry) => (
        <Chip
          key={entry.matchday}
          label={entry.label}
          href={conQuery(base, { ...query, fecha: entry.matchday })}
          active={matchday === entry.matchday}
        />
      ))}
    </nav>
  )
}
