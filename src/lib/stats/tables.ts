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

import { GROUPS } from '@/lib/lide2/tournament'
import { scopeFilter } from './filters'
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
  const raw = Array.isArray(value) ? value[0] : value
  if (!raw) return null

  return GROUP_OPTIONS.find((group) => group.id === raw.toUpperCase())?.label ?? null
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

/**
 * The scope for players and teams, which do not have the group dimension.
 *
 * For them the group filter is one of PRESENTATION, not of aggregation: in the
 * group phase a team only plays teams from its own group, so its totals are
 * already that group's totals and it is enough to not draw the other teams.
 * That is why this is a `filter()` over what was already loaded and not one
 * more filter in the query.
 */
export { scopeFilter }
