/**
 * The cut of the listing, counted in the browser.
 *
 * Neither of /partidas' two filters goes to the server any more - see
 * `MatchFilters` - so the count under the title, and whether anything is left
 * at all, cannot come from the server either: as server-rendered text they
 * would keep saying forty while the listing showed eight.
 *
 * What travels instead is this: every match of the phase reduced to the two
 * things the filters ask about. Forty entries of a number and two ids, against
 * the six hundred scoreboard rows the listing was already carrying.
 */

/** One match, as the filters see it. */
export interface MatchCut {
  /** Its matchday, or null when it has none: playoffs, or not resolved yet. */
  matchday: number | null
  /** The teams that played it, when they are known. */
  teams: string[]
}

/**
 * How many matches survive the cut. Nulls mean "not filtering by that", which
 * is why the whole phase with no team picked counts every match.
 */
export function countCut(
  matches: MatchCut[],
  matchday: number | null,
  teamId: string | null,
): number {
  return matches.filter(
    (match) =>
      (matchday === null || match.matchday === matchday) &&
      (teamId === null || match.teams.includes(teamId)),
  ).length
}
