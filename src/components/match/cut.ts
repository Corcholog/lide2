/**
 * The /partidas filters, counted in the browser.
 *
 * Filtering happens client-side (see `MatchFilters`), so the match count and
 * the empty state are computed here from each match's matchday and team ids.
 */

/** One match, as the filters see it. */
export interface MatchCut {
  /** Its matchday, or null (playoffs or unresolved). */
  matchday: number | null
  /** The teams that played it, when known. */
  teams: string[]
}

/**
 * How many matches match the filters. A null filter means "any", so no filters
 * counts every match.
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
