/**
 * The reasons the organizers can overturn a result for, and how each is read.
 *
 * `fixtures.ruling` only accepts what is listed here - a check in
 * 0031_alineacion_indebida.sql - so a reason cannot turn up in the database
 * without a label to show it with. A new one goes into both places at once.
 *
 * A ruling is not a walkover and must not read like one. "W.O." says somebody
 * did not turn up; here the match WAS played, and what the organizers decided
 * is that it does not count. The site says so with the organizers' own words.
 *
 * `short` is what fits where a scoreline goes on the fixture, a 40px slot:
 * "A.I." sits where "W.O." sits and reads the same way, an abbreviation whose
 * long form is one hover away. Everywhere with room, `long` is what gets
 * written.
 *
 * The values stay in Spanish: visitors read them.
 */
export const RULINGS = {
  alineacion_indebida: { short: 'A.I.', long: 'Alineación indebida' },
} as const

export type Ruling = keyof typeof RULINGS

/**
 * The label for a stored reason, or null when there is no ruling.
 *
 * A value the list does not know - it cannot happen while the check holds, but
 * the database and this file deploy separately - is shown as it came rather
 * than hidden: a result overturned for a reason nobody can read is still a
 * result overturned.
 */
export function rulingLabel(ruling: string | null): { short: string; long: string } | null {
  if (!ruling) return null
  return RULINGS[ruling as Ruling] ?? { short: 'Fallo', long: ruling }
}
