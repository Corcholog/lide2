/**
 * How a scope turns into a PostgREST filter.
 *
 * This used to live inside `query.ts`, private, and now two places need it:
 * `loadStats` for the cards and /estadisticas/tablas for the tables. It sits
 * in its own file so there are never two versions of "how you slice it": if
 * the cards and the tables read `?fecha=2` differently, the same page would
 * show two numbers for the same thing.
 */

import type { StatScope } from './types'

/**
 * The scope, as an equality filter.
 *
 * `is_total` is the filter that matters and cannot be swapped for
 * `matchday is null`: in the accumulated views the row for the whole phase
 * (matchday null on purpose) lives next to the row of a match whose matchday
 * could not be resolved (matchday null by accident).
 */
export function scopeFilter(scope: StatScope): Record<string, unknown> {
  const base = { tournament_id: scope.tournamentId, phase: scope.phase }

  return scope.matchday === null
    ? { ...base, is_total: true }
    : { ...base, is_total: false, matchday: scope.matchday }
}

/** Same, for `match_records`, one row per match and with no accumulated row. */
export function matchFilter(scope: StatScope): Record<string, unknown> {
  const base = { tournament_id: scope.tournamentId, phase: scope.phase }
  return scope.matchday === null ? base : { ...base, matchday: scope.matchday }
}
