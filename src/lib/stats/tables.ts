/**
 * Filters for the Tables tab, which adds a group dimension the stat cards do
 * not have.
 *
 * The group is kept out of `StatScope` on purpose: `player_phase_totals`,
 * `team_phase_totals` and `match_records` have no group column, so the cards
 * could not honour it. Only the queries that support it receive the group.
 */

import { formatPosition, ROLES } from '@/lib/format'
import { GROUPS } from '@/lib/lide2/tournament'
import { firstParam } from '@/lib/url'
import type { StatScope } from './types'

/**
 * The selectable groups, derived from `GROUPS` so a new group appears on its
 * own. The label matches `teams.group_label`, which is what gets filtered on.
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
 * The five roles as filter options, in three forms: `position` is what the
 * database stores ("BOTTOM"), `label` is what the UI shows ("ADC") and `id` is
 * the `?rol=` value ("adc"). All three come from `ROLES` and `formatPosition`
 * so the chips always match the Rol column.
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
 * Role filter for the players table, applied to rows already loaded.
 *
 * `player_phase_totals.position` is the lane each player played most, so this
 * only chooses which players are shown; their numbers still include games in
 * other lanes. Champions use `championsInRole` instead.
 */
export function byRole<T extends { position: string | null }>(
  rows: T[],
  role: RoleOption | null,
): T[] {
  return role ? rows.filter((row) => row.position === role.position) : rows
}

/**
 * The champion rows for a role, or the whole-champion rows when no role is set.
 *
 * For champions the role is a dimension of `champion_meta` (0030): each scope
 * has one row per champion across all roles plus one row per role it was played
 * in, told apart by `all_roles`. Per-role numbers must come from the view,
 * because averages such as `avg_kda` and `dpm` cannot be split after the fact.
 *
 * Both kinds of row arrive in the same query; the whole-champion rows also
 * carry the scope's match counts (see `scopeCounts`).
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
 * Whether a row covers the champion across every role.
 *
 * Checks `!== false` because views older than 0030 have no `all_roles` column,
 * and every row they return is a whole-champion row.
 */
function isWholeChampion(row: { all_roles?: boolean }): boolean {
  return row.all_roles !== false
}

/**
 * The scope's match counts (total and with a draft entered), read from a
 * whole-champion row. Per-role rows cannot be used: a role nobody played has
 * no rows, and the counts would read zero.
 */
export function scopeCounts<T extends { all_roles?: boolean; matches: number; matches_with_bans: number }>(
  rows: T[],
): { matches: number; withDraft: number } {
  const whole = rows.find(isWholeChampion)
  return { matches: whole?.matches ?? 0, withDraft: whole?.matches_with_bans ?? 0 }
}

/**
 * The `champion_meta` scope as an equality filter.
 *
 * Like `scopeFilter`, plus the view's `all_groups` and `all_matchdays` flags.
 * Filtering on `group_label is null` instead would also match games whose
 * group could not be resolved.
 */
export function metaFilter(scope: StatScope, group: string | null): Record<string, unknown> {
  /*
    `champion_meta` keys every dimension with its own flag, so each one has to
    be pinned or the query gets one row per scope. `all_phases` is the one
    added by 0032; the tournament scope exists only with `all_groups`, which is
    why `hasGroups` hides the group filter outside the group phase.
  */
  const base = {
    tournament_id: scope.tournamentId,
    all_groups: group === null,
    ...(group === null ? {} : { group_label: group }),
  }

  switch (scope.kind) {
    case 'torneo':
      return { ...base, all_phases: true, all_matchdays: true }
    case 'fase':
      return { ...base, all_phases: false, phase: scope.phase, all_matchdays: true }
    case 'fecha':
      return {
        ...base,
        all_phases: false,
        phase: scope.phase,
        all_matchdays: false,
        matchday: scope.matchday,
      }
    case 'ronda':
      return {
        ...base,
        all_phases: false,
        phase: scope.phase,
        all_matchdays: false,
        round_label: scope.round,
      }
  }
}
