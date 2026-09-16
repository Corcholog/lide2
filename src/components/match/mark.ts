/**
 * CSS rule that underlines one team's side in every match listing row.
 *
 * Shared by /partidas, where `MatchFilters` emits it in the browser, and team
 * pages, where `MatchList` emits it on the server, so both look the same.
 *
 * The line runs under the team name and its five champions. It adds no text
 * color, because the name's color already shows who won. It is a
 * pseudo-element: a border would shift the marked side by 2px, and an inset
 * shadow would paint behind the champion icons.
 */

import { isUuid } from '@/lib/routes'

/** The rule for one team: its side of each row and of the expanded detail. */
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
