/**
 * Reasons the organizers can overturn a result, with their labels.
 *
 * `fixtures.ruling` only accepts these keys (a check in
 * 0031_alineacion_indebida.sql); add new ones in both places. A ruling is not a
 * walkover: the match was played and does not count. `short` fits where the
 * fixture shows a score ("A.I.", like "W.O."); `long` is used everywhere else.
 * Labels are shown to visitors, so they are in Spanish.
 */
export const RULINGS = {
  alineacion_indebida: { short: 'A.I.', long: 'Alineación indebida' },
} as const

export type Ruling = keyof typeof RULINGS

/**
 * The label for a stored reason, or null without a ruling. Unknown values (the
 * database and the code deploy separately) are shown as stored rather than
 * hidden.
 */
export function rulingLabel(ruling: string | null): { short: string; long: string } | null {
  if (!ruling) return null
  return RULINGS[ruling as Ruling] ?? { short: 'Fallo', long: ruling }
}
