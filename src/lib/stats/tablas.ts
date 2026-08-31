/**
 * El recorte de la pestaña Tablas, que tiene una dimensión más que el de las
 * tarjetas: el grupo.
 *
 * NO ESTÁ EN `StatScope` A PROPÓSITO. Agregarle un `group` a ese tipo sería
 * mentir: `player_phase_totals`, `team_phase_totals` y `match_records` no
 * tienen esa dimensión, así que `loadStats` no la podría honrar y las tarjetas
 * de /estadisticas dirían "Grupo B" mostrando el torneo entero. El grupo viaja
 * al lado y sólo lo usan las consultas que pueden con él.
 */

import { GROUPS } from '@/lib/lide2/tournament'
import { scopeFilter } from './filtros'
import type { StatScope } from './types'

/**
 * Los grupos elegibles.
 *
 * Salen de `GROUPS` y no de una lista aparte por el mismo motivo que
 * `MATCHDAYS` sale de `CALENDAR`: si mañana el torneo tiene cinco grupos,
 * aparece solo. El label es el mismo texto que escribe el seed en
 * `teams.group_label`, que es contra lo que se filtra.
 */
export const GRUPOS = GROUPS.map((letra) => ({ id: letra as string, label: `Grupo ${letra}` }))

/** `?grupo=B` -> "Grupo B", o null (todos) si no viene o no se entiende. */
export function parseGrupo(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value
  if (!raw) return null

  return GRUPOS.find((grupo) => grupo.id === raw.toUpperCase())?.label ?? null
}

/**
 * El recorte de `champion_meta`, como filtro de igualdad.
 *
 * Gemelo de `scopeFilter`, pero con las dos banderas de la vista: una fila con
 * `all_groups` en true es la de todos los grupos juntos, y la de un grupo
 * puntual lleva además su `group_label`. Sin las banderas, filtrar por
 * `group_label is null` traería también las partidas sin grupo resuelto.
 */
export function metaFilter(scope: StatScope, grupo: string | null): Record<string, unknown> {
  return {
    tournament_id: scope.tournamentId,
    phase: scope.phase,
    all_groups: grupo === null,
    ...(grupo === null ? {} : { group_label: grupo }),
    all_matchdays: scope.matchday === null,
    ...(scope.matchday === null ? {} : { matchday: scope.matchday }),
  }
}

/**
 * El recorte de jugadores y equipos, que no tienen la dimensión de grupo.
 *
 * Para ellos el filtro por grupo es de PRESENTACIÓN, no de agregación: en fase
 * de grupos un equipo sólo juega contra los de su grupo, así que sus totales ya
 * son totales de ese grupo y alcanza con no dibujar los otros equipos. Por eso
 * esto es un `filter()` sobre lo que ya se cargó y no un filtro más en la
 * consulta.
 */
export { scopeFilter }
