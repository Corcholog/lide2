/**
 * The scope of the Tables tab, which has one dimension more than the cards do:
 * the group.
 *
 * IT IS DELIBERATELY NOT PART OF `StatScope`. Adding a `group` to that type
 * would be a lie: `player_phase_totals`, `team_phase_totals` and
 * `match_records` do not have that dimension, so `loadStats` could not honour
 * it and the cards on /estadisticas would say "Grupo B" while showing the whole
 * tournament. The group travels alongside and only the queries that can handle
 * it use it.
 */

import { formatPosition, ROLES } from '@/lib/format'
import { GROUPS } from '@/lib/lide2/tournament'
import { firstParam } from '@/lib/url'
import type { StatScope } from './types'

/**
 * The selectable groups.
 *
 * They come from `GROUPS` and not from a separate list for the same reason
 * `MATCHDAYS` comes from `CALENDAR`: if the tournament has five groups
 * tomorrow, the fifth shows up on its own. The label is the same text the seed
 * writes into `teams.group_label`, which is what gets filtered on.
 */
export const GROUP_OPTIONS = GROUPS.map((letter) => ({
  id: letter as string,
  label: `Grupo ${letter}`,
}))

/** `?grupo=B` -> "Grupo B", or null (all of them) when missing or unreadable. */
export function parseGroup(value: string | string[] | undefined): string | null {
  const raw = firstParam(value)
  if (!raw) return null

  return GROUP_OPTIONS.find((group) => group.id === raw.toUpperCase())?.label ?? null
}

/**
 * The five roles, as one selectable option each.
 *
 * The three fields are three different alphabets for the same thing and none of
 * them can stand in for the others: `position` is what the database stores
 * ("BOTTOM"), `label` is what gets read ("ADC") and `id` is what travels in
 * `?rol=` ("adc"). The id comes from the label so the URL is in the same
 * language as the site, like `?grupo=` and `?orden=` already are.
 *
 * All three derive from `ROLES` and `formatPosition`, which is what stops the
 * chips from drifting away from the table's Rol column.
 */
export const ROLE_OPTIONS = ROLES.map((position) => ({
  id: formatPosition(position).toLowerCase(),
  label: formatPosition(position),
  position: position as string,
}))

export type RoleOption = (typeof ROLE_OPTIONS)[number]

/** `?rol=jungla` -> the JUNGLE option, or null (every role) when unreadable. */
export function parseRole(value: string | string[] | undefined): RoleOption | null {
  const raw = firstParam(value)
  if (!raw) return null

  return ROLE_OPTIONS.find((role) => role.id === raw.toLowerCase()) ?? null
}

/**
 * The role filter for the PLAYERS table, applied to what was already loaded.
 *
 * Here the role really is a filter on rows and not a dimension:
 * `player_phase_totals.position` is a `mode()` - the lane each one played most
 * - so this picks which people are drawn and never touches their numbers. A
 * jungler who filled mid twice still carries those two games in their averages.
 *
 * The champions do NOT come through here any more: see `championsInRole`.
 */
export function byRole<T extends { position: string | null }>(
  rows: T[],
  role: RoleOption | null,
): T[] {
  return role ? rows.filter((row) => row.position === role.position) : rows
}

/**
 * The champion rows a role asks for: that role's, or the whole champion's.
 *
 * The role is a DIMENSION of `champion_meta` and not a filter over it (0030).
 * The view returns, for one scope, the row of each champion whole and one row
 * per role it was played in, and `all_roles` says which is which - so choosing
 * a role is choosing which rows to read, not which to throw away.
 *
 * It had to be that way round. Filtering the whole-champion rows was the first
 * try and it answers the wrong question twice over: with `position` being only
 * the commonest role, asking for supports hid a Camille that had been played
 * support, and the Camille that did show up carried the numbers of all three of
 * her picks - two of them from top. A promise of a role, delivering the
 * champion. And it could not be fixed afterwards either: `avg_kda` and `dpm`
 * are averages over picks, and there is no arithmetic that takes an average
 * apart.
 *
 * Both kinds of row come back in the same query, unfiltered, because the page
 * needs the whole-champion ones anyway: they are what carry the size of the
 * scope - `matches`, `matches_with_bans` - and reading that off a role nobody
 * played would say a matchday that WAS played is empty.
 */
export function championsInRole<T extends { all_roles?: boolean; position: string | null }>(
  rows: T[],
  role: RoleOption | null,
): T[] {
  return role
    ? rows.filter((row) => row.all_roles === false && row.position === role.position)
    : rows.filter(isWholeChampion)
}

/**
 * Is this the row of a champion across every role?
 *
 * `!== false` and not a plain truth test, and `all_roles` optional: a view that
 * predates 0030 does not have the column at all, and every row it returns IS a
 * whole champion. Read as truthy, the unfiltered table - the one everybody
 * lands on - would come out empty until the migration is run, and so would the
 * scope's match count, which is worse: the page would answer "nothing has been
 * played here" about a tournament that is half over.
 *
 * That is not hypothetical. It is what the page did the first time this was
 * written, because the same idea was spelled out twice and only one of the two
 * was careful.
 */
function isWholeChampion(row: { all_roles?: boolean }): boolean {
  return row.all_roles !== false
}

/**
 * One whole-champion row, for the things that are about the SCOPE and not about
 * any champion: how many matches it holds and how many have their draft in.
 *
 * Every row carries them, but the per-role ones must not be the source: pick a
 * role nobody played and there are none, and the count would read zero.
 */
export function scopeCounts<T extends { all_roles?: boolean; matches: number; matches_with_bans: number }>(
  rows: T[],
): { matches: number; withDraft: number } {
  const whole = rows.find(isWholeChampion)
  return { matches: whole?.matches ?? 0, withDraft: whole?.matches_with_bans ?? 0 }
}

/**
 * The `champion_meta` scope, as an equality filter.
 *
 * Twin of `scopeFilter`, but with the view's two flags: a row with `all_groups`
 * true is the one for every group together, and the row for a single group
 * carries its `group_label` as well. Without the flags, filtering on
 * `group_label is null` would also drag in matches whose group could not be
 * resolved.
 */
export function metaFilter(scope: StatScope, group: string | null): Record<string, unknown> {
  return {
    tournament_id: scope.tournamentId,
    phase: scope.phase,
    all_groups: group === null,
    ...(group === null ? {} : { group_label: group }),
    all_matchdays: scope.matchday === null,
    ...(scope.matchday === null ? {} : { matchday: scope.matchday }),
  }
}
