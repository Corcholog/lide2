/**
 * Turns a stats scope into a PostgREST filter. Shared by `loadStats` and
 * /estadisticas/tablas so both slice the data the same way.
 */

import type { StatScope } from './types'

/**
 * The scope as an equality filter over the accumulated views.
 *
 * The four scopes are four different rows, not one row with a filter on top
 * (see 0032_torneo_completo.sql):
 *
 *   the tournament  `all_phases`, the only row with no phase
 *   a whole phase   `is_total` with the phase pinned
 *   a matchday      the phase and the matchday
 *   a playoff round the phase and the round label
 *
 * Pinning the phase is what keeps the last three away from the tournament row,
 * whose phase is NULL and so matches no equality.
 */
export function scopeFilter(scope: StatScope): Record<string, unknown> {
  const base = { tournament_id: scope.tournamentId }

  switch (scope.kind) {
    case 'torneo':
      return { ...base, all_phases: true }
    case 'fase':
      return { ...base, phase: scope.phase, is_total: true }
    case 'fecha':
      return { ...base, phase: scope.phase, is_total: false, matchday: scope.matchday }
    case 'ronda':
      return { ...base, phase: scope.phase, is_total: false, round_label: scope.round }
  }
}

/**
 * The same for `match_records`, which has one row per match and no accumulated
 * rows, so there is nothing to tell apart: the tournament is every match.
 *
 * `loadStats` also drops rows with no phase, which are uploads nobody has
 * assigned to a matchup or a series yet.
 */
export function matchFilter(scope: StatScope): Record<string, unknown> {
  const base = { tournament_id: scope.tournamentId }

  switch (scope.kind) {
    case 'torneo':
      return base
    case 'fase':
      return { ...base, phase: scope.phase }
    case 'fecha':
      return { ...base, phase: scope.phase, matchday: scope.matchday }
    case 'ronda':
      return { ...base, phase: scope.phase, round_label: scope.round }
  }
}
