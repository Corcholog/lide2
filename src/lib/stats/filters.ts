/**
 * Turns a stats scope into a PostgREST filter. Shared by `loadStats` and
 * /estadisticas/tablas so both slice the data the same way.
 */

import type { StatScope } from './types'

/**
 * The scope as an equality filter.
 *
 * Filters on `is_total`, not `matchday is null`: in the accumulated views the
 * whole-phase row (matchday null on purpose) sits next to rows of matches whose
 * matchday could not be resolved (also null).
 */
export function scopeFilter(scope: StatScope): Record<string, unknown> {
  const base = { tournament_id: scope.tournamentId, phase: scope.phase }

  return scope.matchday === null
    ? { ...base, is_total: true }
    : { ...base, is_total: false, matchday: scope.matchday }
}

/** The same for `match_records`, which has one row per match and no total row. */
export function matchFilter(scope: StatScope): Record<string, unknown> {
  const base = { tournament_id: scope.tournamentId, phase: scope.phase }
  return scope.matchday === null ? base : { ...base, matchday: scope.matchday }
}
