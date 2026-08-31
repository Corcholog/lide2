/**
 * Cómo se traduce un recorte a un filtro de PostgREST.
 *
 * Estaba adentro de `query.ts`, privado, y ahora lo usan dos lugares:
 * `loadStats` para las tarjetas y /estadisticas/tablas para las tablas. Vive en
 * un archivo aparte para que no haya dos versiones del "cómo se recorta": si
 * las tarjetas y las tablas interpretaran `?fecha=2` distinto, la misma página
 * mostraría dos números para lo mismo.
 */

import type { StatScope } from './types'

/**
 * El recorte, como filtro de igualdad.
 *
 * `is_total` es el filtro importante y no se puede reemplazar por
 * `matchday is null`: en las vistas de acumulados conviven la fila de toda la
 * fase (matchday null a propósito) y la de una partida a la que no se le pudo
 * resolver la fecha (matchday null por accidente).
 */
export function scopeFilter(scope: StatScope): Record<string, unknown> {
  const base = { tournament_id: scope.tournamentId, phase: scope.phase }

  return scope.matchday === null
    ? { ...base, is_total: true }
    : { ...base, is_total: false, matchday: scope.matchday }
}

/** Igual, para `match_records`, que es una fila por partida y no tiene acumulado. */
export function matchFilter(scope: StatScope): Record<string, unknown> {
  const base = { tournament_id: scope.tournamentId, phase: scope.phase }
  return scope.matchday === null ? base : { ...base, matchday: scope.matchday }
}
