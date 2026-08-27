import { CALENDAR } from '@/lib/lide2/tournament'
import type { StatScope } from './types'

/**
 * El recorte del torneo que se está mirando, leído de la URL.
 *
 * Vive acá y no en cada página porque son dos —/estadisticas y /admin/cards— y
 * tienen que estar de acuerdo: lo que se publica en Instagram es lo mismo que
 * dice el sitio, y si cada una interpretara `?fecha=` a su manera podrían
 * terminar mostrando fechas distintas con el mismo link.
 */

/**
 * Las fechas elegibles.
 *
 * Salen del calendario y no de una lista aparte para que no se desincronicen:
 * si se agrega una fecha, aparece sola. Ojo con la diferencia entre fecha y
 * turno: la 1 y la 2 se juegan en dos turnos cada una, así que "fecha" no es lo
 * mismo que "partido".
 */
export const MATCHDAYS = CALENDAR.filter((milestone) => milestone.phase === 'grupos').map(
  (milestone, index) => ({ matchday: index + 1, label: milestone.label }),
)

/** `?fecha=2`, o el acumulado si no viene o no se entiende. */
export function parseScope(
  value: string | string[] | undefined,
  tournamentId: string,
): StatScope {
  const raw = Array.isArray(value) ? value[0] : value
  const matchday = Number(raw)
  const valid = MATCHDAYS.some((entry) => entry.matchday === matchday)

  return { tournamentId, phase: 'grupos', matchday: valid ? matchday : null }
}
