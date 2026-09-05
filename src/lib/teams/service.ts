import { createAdminClient } from '../supabase/admin'
import { detectTeams, type DetectedTeam, type Lineup } from './detect'

export interface DetectedTeamView extends DetectedTeam {
  players: { puuid: string; name: string; appearances: number }[]
}

/**
 * Builds the lineups (the 5 on each side of each match) so teams can be
 * detected. It reads from match_players and not from team_members because at
 * this point there are precisely no teams loaded yet.
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
 * Creates the teams and their rosters, then relinks every match: the ones
 * already loaded start showing team names without re-uploading anything.
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
  /** The account did not exist and was created without a PUUID, until it shows up in a replay. */
  created?: boolean
  /** Matches the account already had behind it. */
  games?: number
}

/**
 * Adding a nick to a roster even when that person has not played yet.
 *
 * `players` fills itself from the replays, so until the first match a team has
 * nobody to add: the "add player" list on a team's page is the accounts that
 * have played and have no team, and before matchday 1 it is empty. This is the
 * other door, the one where the nick is typed by hand.
 *
 * Everything it decides lives in `add_team_account()`: if the account already
 * exists it is reused, otherwise it is created with a marker in place of the
 * PUUID (which only exists inside the .rofl), and nobody is moved between teams
 * on its own initiative. See `supabase/migrations/0017_alta_de_cuenta.sql`.
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

  // Relink only when the account brought matches with it: those are the ones
  // that start showing the team name. A freshly added account changes none.
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
  /** The account they had was taken away, rather than one being given. */
  cleared?: boolean
}

/**
 * Saying who an account belongs to.
 *
 * The automatic path - `link_roster_accounts()` - only matches when the Riot ID
 * on the signup sheet equals the account's, and when in doubt it does nothing.
 * This is the manual door: the team page uses it, which is the screen where the
 * nicks get entered and where whoever enters them knows whose each one is.
 *
 * Every validation lives in `assign_roster_account()`: that the account belongs
 * to that team's roster and that it is not already somebody else's signup. See
 * `supabase/migrations/0019_asignar_cuenta.sql`.
 *
 * No relinking is needed: this link does not change which team played what,
 * only which university each account counts towards in the stats.
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
 * Saying by hand which lane an account plays.
 *
 * `team_lineup` deduces the lane from the match history, and before anything is
 * played it has nowhere to get it from. This is the manual door: the team page
 * uses it, next to every nick on the roster, for the cases where whoever enters
 * the nicks already knows which lane each one plays.
 *
 * It is a provisional and it loses against the first replay: since 0023 the
 * lane comes from what was played whenever anything was, because what somebody
 * was told at signup can be out of date by Sunday and the scoreboard cannot.
 * What it still does is fill the lineup while there is nothing to deduce from.
 * Passing `null` clears it, which is how a wrong assignment is undone.
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
  /** Whether the signup travelled with it, which is what fixes the attribution. */
  roster_moved?: boolean
}

/**
 * Saying that a nick that never played is the old nick of one that did.
 *
 * `adopt_manual_accounts()` already covers the happy path: a nick typed in
 * during the week that turns up spelled the same gets the real PUUID on its own
 * row and nothing is duplicated. When the nick CHANGED there is nothing to
 * match on, so the ingest creates a second account and the typed one is left at
 * zero games forever - holding the signup, and with it the university that
 * person's matches count towards.
 *
 * This is the door for that case, and it is never taken automatically: the
 * panel proposes a pairing and a person confirms it. A wrong merge hands
 * somebody's matches to another university and nobody sees it afterwards, which
 * is the same reason `link_roster_accounts` and `adopt_manual_accounts` do
 * nothing when in doubt.
 *
 * Every validation lives in `merge_manual_account()`. See
 * `supabase/migrations/0023_plantel_dinamico.sql`.
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

  // The absorbed row took a `team_members` entry with it, so which accounts
  // belong to the team changed. Relinking re-runs `side_team()` over every
  // match, which is what decides team names from a scoreboard.
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
