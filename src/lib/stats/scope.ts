import { CALENDAR } from '@/lib/lide2/tournament'
import { firstParam } from '@/lib/url'
import type { StatScope } from './types'

/**
 * The slice of the tournament being looked at, read from the URL.
 *
 * It lives here and not in each page because there are two of them —
 * /estadisticas and /admin/cards — and they have to agree: what gets posted to
 * Instagram is what the site says, and if each one read `?fecha=` its own way
 * they could end up showing different matchdays behind the same link.
 *
 * The query-string keys stay in Spanish (`?fecha=`, `?equipo=`): they are part
 * of the links people paste around.
 */

/**
 * The selectable matchdays.
 *
 * They come from the calendar and not from a separate list so the two cannot
 * drift apart: add a matchday and it shows up on its own. Mind the difference
 * between matchday and slot: matchdays 1 and 2 are played in two slots each,
 * so "matchday" is not the same as "match".
 */
export const MATCHDAYS = CALENDAR.filter((milestone) => milestone.phase === 'grupos').map(
  (milestone, index) => ({ matchday: index + 1, label: milestone.label }),
)

/**
 * `?fecha=2`, or the accumulated total when it is missing or unreadable.
 *
 * It is apart from `parseScope` because /partidas reads the matchday without a
 * scope around it: there the cut is not a query to the database but a rule in
 * the browser, so a tournament id would be a parameter with nothing to do.
 */
export function parseMatchday(value: string | string[] | undefined): number | null {
  const matchday = Number(firstParam(value))

  return MATCHDAYS.some((entry) => entry.matchday === matchday) ? matchday : null
}

/** The same, as the slice the stats queries are filtered by. */
export function parseScope(
  value: string | string[] | undefined,
  tournamentId: string,
): StatScope {
  return { tournamentId, phase: 'grupos', matchday: parseMatchday(value) }
}

/**
 * `?equipo=<uuid>`, validated against the teams in the tournament.
 *
 * This is the other half of the same query string, which is why it sits next
 * to `parseScope` instead of in a module of its own.
 *
 * An id that is not on the list is ignored rather than filtered on: pasting
 * any random uuid would return an empty list, and that reads as "this team
 * played nothing" when what actually happened is that the team does not exist.
 */
export function parseTeamFilter(
  value: string | string[] | undefined,
  validTeamIds: Iterable<string>,
): string | null {
  const id = firstParam(value)
  if (!id) return null

  return new Set(validTeamIds).has(id) ? id : null
}
