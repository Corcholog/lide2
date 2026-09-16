/**
 * Team order on /equipos: by name (default, works before any game) or by win
 * rate. Sorted here rather than in SQL because the win rate is not a column.
 * The values are what travels in `?orden=`, so they are in Spanish.
 */

export type TeamOrder = 'alfabetico' | 'winrate'

/** The fields needed to sort a team. */
export interface OrderableTeam {
  name: string
  games: number
  wins: number
}

/**
 * The order from the URL. Anything other than `winrate` (empty, unknown, a
 * repeated parameter) uses the default.
 */
export function parseTeamOrder(value: string | string[] | undefined): TeamOrder {
  return value === 'winrate' ? 'winrate' : 'alfabetico'
}

/**
 * Numeric-aware name order, so "Equipo 2" sorts before "Equipo 10" even
 * without zero padding.
 */
function byName(a: OrderableTeam, b: OrderableTeam): number {
  return a.name.localeCompare(b.name, 'es', { numeric: true, sensitivity: 'base' })
}

/**
 * Sorts a copy of the teams.
 *
 * By win rate, teams that have not played go last (0 of 0 is unknown, not
 * 0%), and on equal percentages the team with more games goes first.
 */
export function sortTeams<T extends OrderableTeam>(teams: T[], order: TeamOrder): T[] {
  if (order === 'alfabetico') return [...teams].sort(byName)

  return [...teams].sort((a, b) => {
    if (a.games === 0 || b.games === 0) {
      if (a.games !== b.games) return a.games === 0 ? 1 : -1
      return byName(a, b)
    }

    const winrate = b.wins / b.games - a.wins / a.games
    if (winrate !== 0) return winrate
    if (b.games !== a.games) return b.games - a.games
    return byName(a, b)
  })
}
