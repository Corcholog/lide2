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

/** The tournament's champion: whoever won the grand final, once it is played. */
export function championOf(series: SeriesResultRow[]): string | undefined {
  return seriesWinner(series.find((item) => item.round === FINAL_ROUND))
}
