/**
 * The order teams are listed in on /equipos.
 *
 * Two orders and no more, because they answer two different questions:
 * alphabetical is "where is mine?" - with twenty teams called "Equipo
 * 01".."Equipo 20", finding your own is what people do most - and win rate is
 * "who is winning?". The first one is the default: it works even when nothing
 * has been played, and the other one does not.
 *
 * It lives here and not in the query's `order by` because the win rate is not a
 * column: `team_totals` brings `wins` and `games` separately, and sorting by
 * wins puts a 3-3 above a 2-0.
 *
 * The two values stay in Spanish: they are what travels in `?orden=`.
 */

export type TeamOrder = 'alfabetico' | 'winrate'

/** What has to be known about a team in order to sort it. */
export interface OrderableTeam {
  name: string
  games: number
  wins: number
}

/**
 * The order the URL asked for. Anything that is not `winrate` - empty, a
 * made-up word, a repeated `?orden=` - falls back to the default.
 */
export function parseTeamOrder(value: string | string[] | undefined): TeamOrder {
  return value === 'winrate' ? 'winrate' : 'alfabetico'
}

/**
 * Properly alphabetical: `localeCompare` with `numeric` so "Equipo 2" comes
 * before "Equipo 10". Today the names carry a leading zero and plain text order
 * would do, but that is a convention of the seed, not a guarantee.
 */
function byName(a: OrderableTeam, b: OrderableTeam): number {
  return a.name.localeCompare(b.name, 'es', { numeric: true, sensitivity: 'base' })
}

/**
 * Sorts without touching the original array.
 *
 * Under win rate, a team that has not played yet goes last and not first: 0 out
 * of 0 is not 0%, it is unknown - the card shows an em dash - and opening the
 * list with the teams that played nothing is the exact opposite of what people
 * came to see. Between two on the same percentage, whoever played more games
 * comes first, because 100% across three games says more than 100% across one.
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
