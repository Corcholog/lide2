import type { SeriesResultRow } from '@/types/db'

/**
 * Who won a series, and who won the tournament, read off the bracket.
 *
 * `series_results` records the winner as an id, and the name sits in one of two
 * columns depending on which side of the card the team came up on. The
 * bracket's champion box and the hero both need that resolved, and each used to
 * do it on its own: two copies of the same three lines, which is how the same
 * final ends up with a different name in each place.
 *
 * "Champion" here is the tournament's winner. `src/lib/champions/` is about
 * League's champions - Ahri, Yasuo - which is why this file is not called that.
 */

/** The round `series_results` stores for the tournament's last series. */
export const FINAL_ROUND = 'Gran final'

/** The winner's name, or undefined while the series is not decided. */
export function seriesWinner(series: SeriesResultRow | undefined): string | undefined {
  if (!series?.winner_team_id) return undefined

  const name = series.winner_team_id === series.team_a_id ? series.team_a_name : series.team_b_name

  // The names come off a join and are typed nullable: a series can be scheduled
  // with one side still to be decided. A decided one always carries both, and
  // if it did not there would be nothing to show anyway.
  return name ?? undefined
}

/** The tournament's champion: whoever won the grand final, once it is played. */
export function championOf(series: SeriesResultRow[]): string | undefined {
  return seriesWinner(series.find((item) => item.round === FINAL_ROUND))
}
