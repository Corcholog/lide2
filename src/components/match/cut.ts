/**
 * The /partidas filters, counted in the browser.
 *
 * Filtering happens client-side (see `MatchFilters`), so the match count and
 * the empty state are computed here rather than coming from a query.
 */

/** One match, as the filters see it. */
export interface MatchCut {
  /**
   * The `?fecha=` values it belongs to, from `scopesOf`: its phase, and its
   * matchday or its round. The CSS rule hides rows by the same list, so what
   * is counted and what is shown cannot disagree.
   */
  scopes: string[]
  /** The teams that played it, when known. */
  teams: string[]
}

/**
 * How many matches match the filters. A null filter means "any", so no filters
 * counts every match.
 */
export function countCut(
  matches: MatchCut[],
  scope: string | null,
  teamId: string | null,
): number {
  return matches.filter(
    (match) =>
      (scope === null || match.scopes.includes(scope)) &&
      (teamId === null || match.teams.includes(teamId)),
  ).length
}
