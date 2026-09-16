import { CALENDAR } from '@/lib/lide2/tournament'
import { firstParam } from '@/lib/url'
import type { StatScope } from './types'

/**
 * The tournament slice being viewed, read from the URL.
 *
 * Shared by /estadisticas, /estadisticas/tablas and /admin/cards so they all
 * read `?fecha=` the same way. Query keys stay in Spanish because they are part
 * of shared links.
 */

/**
 * The selectable matchdays, derived from the calendar. A matchday can have two
 * time slots, so matchdays and matches are not the same thing.
 */
export const MATCHDAYS = CALENDAR.filter((milestone) => milestone.phase === 'grupos').map(
  (milestone, index) => ({ matchday: index + 1, label: milestone.label }),
)

/**
 * `?fecha=2`, or null (the whole phase) when missing or invalid. Separate from
 * `parseScope` because /partidas filters by matchday in the browser and has no
 * query scope.
 */
export function parseMatchday(value: string | string[] | undefined): number | null {
  const matchday = Number(firstParam(value))

  return MATCHDAYS.some((entry) => entry.matchday === matchday) ? matchday : null
}

/** The matchday as a stats query scope. */
export function parseScope(
  value: string | string[] | undefined,
  tournamentId: string,
): StatScope {
  return { tournamentId, phase: 'grupos', matchday: parseMatchday(value) }
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
