import { Chip } from '@/components/nav/Chip'
import { conQuery } from '@/lib/url'

/**
 * Las dos formas de mirar las estadísticas.
 *
 * RANKINGS es el top cinco de cada cosa: qué pasó en el torneo, leído de un
 * saque. Es lo mismo que sale publicado en las redes desde /admin/cards, y por
 * eso está armado como está.
 *
 * TABLAS es todo, ordenable y filtrable: sirve para buscarse a uno mismo, ver
 * el pool entero de campeones o comparar dos equipos. Un jugador que entra a
 * ver cómo le fue no viene por el top cinco del torneo.
 *
 * Son dos rutas y no un `?vista=` porque cargan datos distintos —Rankings hace
 * siete consultas, Tablas tres— y cada una tiene su propio título. Y son links
 * y no `role="tablist"`: esto es navegación entre páginas, no pestañas de un
 * mismo documento.
 */
export function VistaNav({
  activa,
  query = {},
}: {
  activa: 'rankings' | 'tablas'
  query?: Record<string, string | number | null | undefined>
}) {
  return (
    <nav aria-label="Vista" className="flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:pb-0">
      <Chip
        label="Rankings"
        href={conQuery('/estadisticas', query)}
        active={activa === 'rankings'}
      />
      <Chip
        label="Tablas"
        href={conQuery('/estadisticas/tablas', query)}
        active={activa === 'tablas'}
      />
    </nav>
  )
}
