/**
 * The team a listing is about, marked in every row it appears in.
 *
 * It is one CSS rule and lives in a module of its own because two very
 * different callers emit it: /partidas, where the team is picked in the browser
 * and the rule is what a `<style>` writes without re-rendering a thing (see
 * `MatchFilters`), and a team's page, where the listing is already about one
 * team and `MatchList` writes the same rule on the server. Same mark from the
 * same place, so the two cannot drift apart.
 *
 * WHY A MARK AT ALL. A row reads "A against B", blue on the left and red on the
 * right, and that is right for the history as a whole - what it highlights is
 * who won. Cut to one team, or read on its page, the question changes: which of
 * these two is mine, and is that scoreline theirs. With twenty teams called
 * "Equipo 01" to "Equipo 20" that is two names to compare on every row.
 *
 * IT IS A LINE UNDER THE SIDE, and it started out as a filled chip around the
 * name. That read like a hit from Ctrl+F: a word found in a page, which is
 * about the string and not about the team. A line runs under the name AND the
 * five champions it played - `MatchList` puts the two in one box so there is
 * something to draw it under - so what it points at is a side of the match,
 * which is the thing you are actually looking for.
 *
 * IT ADDS NO COLOUR TO THE TEXT. The name already carries one and it means
 * something: aqua or red for the winner, by side, and `fg-soft` for the loser.
 * Repainting it would spend the result - the thing the listing exists to show -
 * to say the team, which is the fact you already know. Under the line both
 * survive: whether the underlined name is coloured or grey is whether they won.
 *
 * IT IS DRAWN BY A PSEUDO-ELEMENT and not by a border or a shadow, because
 * neither can be put where this one goes. A border grows the box by two pixels,
 * and since only one of the two sides is marked, that side would sit two pixels
 * off the other. An inset shadow keeps the size but paints inside the box,
 * which is where the champion icons are: the line would end up behind them.
 */

import { isUuid } from '@/lib/routes'

/** Where the listing draws that team: the row's side, and the open detail. */
export function markRule(teamId: string): string {
  // Only UUID-shaped ids are interpolated: this ends up inside a `<style>`.
  if (!isUuid(teamId)) return ''

  const marked = `#partidas [data-team="${teamId}"]`

  return (
    `${marked}{position:relative}` +
    `${marked}::after{content:"";position:absolute;inset-inline:0;bottom:-0.25rem;` +
    `height:2px;background:var(--accent)}`
  )
}
