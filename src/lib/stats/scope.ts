import { CALENDAR } from '@/lib/lide2/tournament'
import { firstParam } from '@/lib/url'
import type { StatScope } from './types'

/**
 * The tournament slice being viewed, read from the URL.
 *
 * Shared by /estadisticas, /estadisticas/tablas and /admin/cards so they all
 * read `?fecha=` the same way. The key stays `fecha` even though it now also
 * carries phases and playoff rounds: it travels in links people have already
 * shared, and `?fecha=2` still means what it meant.
 *
 * No parameter means the whole tournament, which is the page someone landing
 * today wants to see.
 */

/**
 * The selectable matchdays, derived from the calendar. A matchday can have two
 * time slots, so matchdays and matches are not the same thing.
 */
export const MATCHDAYS = CALENDAR.filter((milestone) => milestone.phase === 'grupos').map(
  (milestone, index) => ({ matchday: index + 1, label: milestone.label }),
)

/**
 * The selectable playoff rounds.
 *
 * `id` is the `?fecha=` value and `label` is what the database stores in
 * `round_label`, which is the series' round. Both come from the calendar so
 * the two are never written twice and cannot drift apart; `tests/scope.test.ts`
 * checks the labels still match what the seed writes.
 */
export const ROUNDS = CALENDAR.filter((milestone) => milestone.phase === 'playoffs').map(
  (milestone) => ({ id: milestone.id, label: milestone.label }),
)

/**
 * `?fecha=2`, or null when missing or invalid. Separate from `parseScope`
 * because /partidas filters by matchday in the browser and has no query scope.
 */
export function parseMatchday(value: string | string[] | undefined): number | null {
  const matchday = Number(firstParam(value))

  return MATCHDAYS.some((entry) => entry.matchday === matchday) ? matchday : null
}

/**
 * The scope a `?fecha=` value names.
 *
 * Anything unreadable falls back to the whole tournament rather than to an
 * error: the value travels in shared links, and a stale one should still show
 * a page.
 */
export function parseScope(
  value: string | string[] | undefined,
  tournamentId: string,
): StatScope {
  const raw = firstParam(value)?.toLowerCase()

  if (raw === 'grupos' || raw === 'playoffs') {
    return { kind: 'fase', tournamentId, phase: raw }
  }

  const matchday = parseMatchday(raw)
  if (matchday !== null) {
    return { kind: 'fecha', tournamentId, phase: 'grupos', matchday }
  }

  const round = ROUNDS.find((entry) => entry.id === raw)
  if (round) {
    return { kind: 'ronda', tournamentId, phase: 'playoffs', round: round.label }
  }

  return { kind: 'torneo', tournamentId }
}

/**
 * The `?fecha=` value a scope travels as, which `parseScope` reads back. The
 * whole tournament is null: it is the default, so it needs no parameter.
 */
export function scopeValue(scope: StatScope): string | null {
  switch (scope.kind) {
    case 'torneo':
      return null
    case 'fase':
      return scope.phase
    case 'fecha':
      return String(scope.matchday)
    case 'ronda':
      return ROUNDS.find((entry) => entry.label === scope.round)?.id ?? null
  }
}

/** How the scope is named on the page. */
export function scopeLabel(scope: StatScope): string {
  switch (scope.kind) {
    case 'torneo':
      return 'Todo el torneo'
    case 'fase':
      return scope.phase === 'grupos' ? 'Fase de grupos' : 'Playoffs'
    case 'fecha':
      return `Fecha ${scope.matchday}`
    case 'ronda':
      return scope.round
  }
}

/** The line under the page's heading, saying what is being counted. */
export function scopeSubtitle(scope: StatScope): string {
  switch (scope.kind) {
    case 'torneo':
      return 'Todo el torneo: la fase de grupos y los playoffs juntos'
    case 'fase':
      return scope.phase === 'grupos'
        ? 'Acumulado de toda la fase de grupos'
        : 'Acumulado de los playoffs, de cuartos en adelante'
    case 'fecha':
      return `Fecha ${scope.matchday} de la fase de grupos`
    case 'ronda':
      return `${scope.round}, partida por partida`
  }
}

/**
 * Whether the group filter means anything here.
 *
 * Only inside the group phase: a playoff series belongs to no group, so the
 * tournament and playoff scopes have no rows split by group at all (0032). The
 * filter is hidden rather than left to come back empty.
 */
export function hasGroups(scope: StatScope): boolean {
  return scope.kind === 'fecha' || (scope.kind === 'fase' && scope.phase === 'grupos')
}

/**
 * `?equipo=<uuid>`, if it is one of the tournament's teams. Unknown ids are
 * ignored rather than applied: an empty list would wrongly suggest the team
 * played nothing.
 */
export function parseTeamFilter(
  value: string | string[] | undefined,
  validTeamIds: Iterable<string>,
): string | null {
  const id = firstParam(value)
  if (!id) return null

  return new Set(validTeamIds).has(id) ? id : null
}
