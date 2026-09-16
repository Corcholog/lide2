import { createAdminClient } from '../supabase/admin'
import { detectTeams, type DetectedTeam, type Lineup } from './detect'

export interface DetectedTeamView extends DetectedTeam {
  players: { puuid: string; name: string; appearances: number }[]
}

/**
 * Loads the lineups (the five players on each side of each match) for team
 * detection. Reads `match_players`, since no teams exist yet at this point.
 */
async function loadLineups(): Promise<{ lineups: Lineup[]; names: Map<string, string> }> {
  const supabase = createAdminClient()
  const [{ data: players }, { data: files }] = await Promise.all([
    supabase.from('match_players').select('match_id,side,puuid,riot_game_name,riot_tag_line'),
    supabase.from('match_files').select('match_id,file_name'),
  ])

  const filesByMatch = new Map<string, string[]>()
  for (const file of files ?? []) {
    const list = filesByMatch.get(file.match_id as string) ?? []
    list.push(file.file_name as string)
    filesByMatch.set(file.match_id as string, list)
  }

  const names = new Map<string, string>()
  const grouped = new Map<string, Lineup>()

  for (const row of players ?? []) {
    const puuid = row.puuid as string
    const matchId = row.match_id as string
    names.set(puuid, (row.riot_game_name as string) ?? puuid.slice(0, 8))

    const key = `${matchId}-${row.side}`
    const lineup = grouped.get(key) ?? {
      matchId,
      side: row.side as 100 | 200,
      puuids: [],
      fileNames: filesByMatch.get(matchId) ?? [],
    }
    lineup.puuids.push(puuid)
    grouped.set(key, lineup)
  }

  return { lineups: [...grouped.values()], names }
}

export async function detectTeamsFromMatches(): Promise<DetectedTeamView[]> {
  const { lineups, names } = await loadLineups()

  return detectTeams(lineups).map((team) => ({
    ...team,
    players: team.puuids.map((puuid) => ({
      puuid,
      name: names.get(puuid) ?? puuid.slice(0, 8),
      appearances: team.appearances[puuid] ?? 0,
    })),
  }))
}

export interface TeamToCreate {
  name: string
  puuids: string[]
}

/**
 * Creates the teams and their rosters, then relinks every match so already
 * loaded matches show team names.
 */
export async function createTeams(teams: TeamToCreate[]): Promise<number> {
  const supabase = createAdminClient()
  let created = 0

  for (const team of teams) {
    if (!team.name.trim() || team.puuids.length === 0) continue

    const { data: inserted, error } = await supabase
      .from('teams')
      .insert({ name: team.name.trim() })
      .select('id')
      .single()

    if (error || !inserted) continue

    const { data: players } = await supabase
      .from('players')
      .select('id,puuid')
      .in('puuid', team.puuids)

    const members = (players ?? []).map((player) => ({
      team_id: inserted.id as string,
      player_id: player.id as string,
    }))

    if (members.length > 0) await supabase.from('team_members').insert(members)
    created++
  }

  if (created > 0) await supabase.rpc('relink_all_matches')
  return created
}

export async function relinkAllMatches(): Promise<number> {
  const { data } = await createAdminClient().rpc('relink_all_matches')
  return Number(data ?? 0)
}

export async function addPlayerToTeam(teamId: string, playerId: string): Promise<void> {
  const supabase = createAdminClient()
  await supabase.from('team_members').insert({ team_id: teamId, player_id: playerId })
  await supabase.rpc('relink_all_matches')
}

export interface AddAccountResult {
  ok: boolean
  error?: string
  /** The account did not exist and was created without a PUUID until it appears in a replay. */
  created?: boolean
  /** Matches the account already had behind it. */
  games?: number
}

/**
 * Adds a nick to a team's roster, even if that person has not played yet.
 *
 * `players` is filled from replays, so before the first matchday there is no
 * account to pick; this lets the nick be typed instead. The logic lives in
 * `add_team_account()`: an existing account is reused, otherwise one is created
 * with a placeholder instead of the PUUID, and nobody is moved between teams.
 * See `supabase/migrations/0017_alta_de_cuenta.sql`.
 */
export async function addAccountToTeam(
  teamId: string,
  gameName: string,
  tagLine: string | null,
): Promise<AddAccountResult> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('add_team_account', {
    p_team_id: teamId,
    p_game_name: gameName,
    p_tag_line: tagLine,
  })

  if (error) return { ok: false, error: error.message }

  const result = data as AddAccountResult

  // Relink only when the account already had matches; a new one changes none.
  if (result.ok && (result.games ?? 0) > 0) await supabase.rpc('relink_all_matches')

  return result
}

export interface AssignAccountResult {
  ok: boolean
  error?: string
  /** The signup that was just touched. */
  name?: string
  /** The Riot ID that ended up matched. */
  nick?: string
  /** The previous account was unlinked instead of a new one being assigned. */
  cleared?: boolean
}

/**
 * Links a signup to an account by hand.
 *
 * `link_roster_accounts()` only matches when the Riot ID on the signup sheet
 * equals the account's; this covers the rest, from the team page. Validation
 * lives in `assign_roster_account()` (see
 * `supabase/migrations/0019_asignar_cuenta.sql`). No relink is needed: this
 * only changes which university an account counts towards.
 */
export async function assignRosterAccount(
  rosterId: string,
  playerId: string | null,
): Promise<AssignAccountResult> {
  const { data, error } = await createAdminClient().rpc('assign_roster_account', {
    p_roster_id: rosterId,
    p_player_id: playerId,
  })

  if (error) return { ok: false, error: error.message }
  return data as AssignAccountResult
}

export interface AssignRoleResult {
  ok: boolean
  error?: string
  /** The signup that was just touched. */
  name?: string
  /** The lane that ended up assigned, or null when it was cleared. */
  role?: string | null
}

/**
 * Sets an account's lane by hand, from the team page.
 *
 * `team_lineup` takes lanes from played matches (0023), so this only fills the
 * lineup before any replay exists and loses to the first one. Passing `null`
 * clears it.
 */
export async function assignTeamMemberRole(
  teamId: string,
  playerId: string,
  role: string | null,
): Promise<AssignRoleResult> {
  const { data, error } = await createAdminClient().rpc('assign_team_member_role', {
    p_team_id: teamId,
    p_player_id: playerId,
    p_role: role,
  })

  if (error) return { ok: false, error: error.message }
  return data as AssignRoleResult
}

export interface MergeAccountResult {
  ok: boolean
  error?: string
  /** The account that stays: the one that actually played. */
  name?: string
  /** The hand-typed nick that was absorbed. */
  previous?: string
  /** Whether the signup moved to the kept account, which fixes the university attribution. */
  roster_moved?: boolean
}

/**
 * Merges a hand-typed nick that never played into the account that did (the
 * player changed their nick).
 *
 * `adopt_manual_accounts()` handles a nick that shows up spelled the same.
 * When the nick changed there is nothing to match on, so the ingest creates a
 * second account and the typed one keeps the signup with zero games. This is
 * never automatic: the panel suggests a pairing and an admin confirms it, since
 * a wrong merge would credit matches to the wrong university. Validation lives
 * in `merge_manual_account()` (see `supabase/migrations/0023_plantel_dinamico.sql`).
 */
export async function mergeManualAccount(
  teamId: string,
  placeholderId: string,
  realId: string,
): Promise<MergeAccountResult> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('merge_manual_account', {
    p_team_id: teamId,
    p_placeholder: placeholderId,
    p_real: realId,
  })

  if (error) return { ok: false, error: error.message }

  const result = data as MergeAccountResult

  // The merge moved a `team_members` entry, so relink every match: `side_team()`
  // decides team names from the scoreboard.
  if (result.ok) await supabase.rpc('relink_all_matches')

  return result
}

export async function removePlayerFromTeam(teamId: string, playerId: string): Promise<void> {
  const supabase = createAdminClient()
  await supabase.from('team_members').delete().eq('team_id', teamId).eq('player_id', playerId)
  await supabase.rpc('relink_all_matches')
}

export async function createEmptyTeam(name: string): Promise<string | null> {
  const { data } = await createAdminClient()
    .from('teams')
    .insert({ name: name.trim() })
    .select('id')
    .single()

  return (data?.id as string) ?? null
}

export async function deleteTeam(teamId: string): Promise<void> {
  const supabase = createAdminClient()
  await supabase.from('teams').delete().eq('id', teamId)
  await supabase.rpc('relink_all_matches')
}
