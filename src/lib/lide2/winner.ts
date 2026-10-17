import type { SeriesResultRow } from '@/types/db'

/**
 * The winner of a series and of the tournament, from `series_results`.
 *
 * The winner is stored as an id and its name is in one of two columns depending
 * on the side. Shared by the bracket and the hero so both show the same name.
 * ("Champion" here means the tournament winner; `src/lib/champions/` is about
 * League champions.)
 */

/** The round `series_results` stores for the tournament's last series. */
export const FINAL_ROUND = 'Gran final'

/** The winner's name, or undefined while the series is not decided. */
export function seriesWinner(series: SeriesResultRow | undefined): string | undefined {
  if (!series?.winner_team_id) return undefined

  const name = series.winner_team_id === series.team_a_id ? series.team_a_name : series.team_b_name

  // Names come from a join and are nullable because a scheduled series may
  // have an undecided side; a decided series always has both.
  return name ?? undefined
}

/** The winner's id, or undefined while the series is not decided. */
export function seriesWinnerId(series: SeriesResultRow | undefined): string | undefined {
  // Same guard as the name: a winner without a name would be a half-filled row.
  return seriesWinner(series) ? (series?.winner_team_id ?? undefined) : undefined
}

/** The champion's id, once the grand final is played. */
export function championTeamId(series: SeriesResultRow[]): string | undefined {
  return seriesWinnerId(series.find((item) => item.round === FINAL_ROUND))
}

/** The final's games won, winner first ("3-1"), or undefined while undecided. */
export function finalScore(series: SeriesResultRow[]): string | undefined {
  const final = series.find((item) => item.round === FINAL_ROUND)
  // An awarded series has no games, so there is no score to show.
  if (!seriesWinner(final) || !final || final.games_played === 0) return undefined

  const aWon = final.winner_team_id === final.team_a_id
  return aWon ? `${final.wins_a}-${final.wins_b}` : `${final.wins_b}-${final.wins_a}`
}

/** The tournament's champion: whoever won the grand final, once it is played. */
export function championOf(series: SeriesResultRow[]): string | undefined {
  return seriesWinner(series.find((item) => item.round === FINAL_ROUND))
}
