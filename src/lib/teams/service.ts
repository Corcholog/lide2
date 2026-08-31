import { createAdminClient } from '../supabase/admin'
import { detectTeams, type DetectedTeam, type Lineup } from './detect'

export interface DetectedTeamView extends DetectedTeam {
  players: { puuid: string; name: string; appearances: number }[]
}

/**
 * Arma las alineaciones (los 5 de cada lado de cada partida) para poder
 * detectar equipos. Se lee de match_players y no de team_members porque
 * justamente todavía no hay equipos cargados.
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
 * Crea los equipos y sus rosters, y revincula todas las partidas: las que ya
 * estaban cargadas pasan a mostrar nombres de equipo sin volver a subir nada.
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
  /** La cuenta no existía y se creó sin PUUID, hasta que aparezca en un replay. */
  created?: boolean
  /** Partidas que la cuenta ya tenía encima. */
  games?: number
}

/**
 * Sumar un nick al plantel aunque esa persona todavía no haya jugado.
 *
 * `players` se llena sola desde los replays, así que hasta la primera partida
 * un equipo no tiene a nadie a quien agregar: la lista de "agregar jugador" de
 * la ficha son las cuentas que ya jugaron y no tienen equipo, y antes de la
 * fecha 1 está vacía. Esto es la otra puerta, la de escribir el nick a mano.
 *
 * Todo lo que decide está en `add_team_account()`: si la cuenta ya existe la
 * reusa, si no la crea con una marca en lugar del PUUID (que sólo existe dentro
 * del .rofl), y no muda a nadie de equipo por su cuenta. Ver
 * `supabase/migrations/0017_alta_de_cuenta.sql`.
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

  // Revincular sólo si la cuenta traía partidas: son las que pasan a mostrar el
  // nombre del equipo. Una cuenta recién cargada no cambia ninguna.
  if (result.ok && (result.games ?? 0) > 0) await supabase.rpc('relink_all_matches')

  return result
}

export interface AssignAccountResult {
  ok: boolean
  error?: string
  /** El inscripto que se acaba de tocar. */
  name?: string
  /** El Riot ID que quedó emparejado. */
  nick?: string
  /** Se le sacó la cuenta que tenía, en vez de darle una. */
  cleared?: boolean
}

/**
 * Decir de quién es una cuenta.
 *
 * Lo automático —`link_roster_accounts()`— empareja sólo cuando el Riot ID de
 * la planilla coincide con el de la cuenta, y ante la duda no hace nada. Esto
 * es la puerta manual: la usa la ficha del equipo, que es la pantalla donde se
 * cargan los nicks y donde quien los carga sabe de quién es cada uno.
 *
 * Las validaciones están todas en `assign_roster_account()`: que la cuenta sea
 * del plantel de ese equipo y que no sea ya de otro inscripto. Ver
 * `supabase/migrations/0019_asignar_cuenta.sql`.
 *
 * No hace falta revincular partidas: este vínculo no cambia qué equipo jugó
 * qué, sólo con qué universidad cuenta cada cuenta en las estadísticas.
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
  /** El inscripto que se acaba de tocar. */
  name?: string
  /** La línea que quedó asignada, o null si se limpió. */
  role?: string | null
}

/**
 * Decir a mano en qué línea juega una cuenta.
 *
 * `team_lineup` deduce la línea del historial de partidas, y antes de que se
 * juegue algo no tiene de dónde sacarla. Esto es la puerta manual: la usa la
 * ficha del equipo, al lado de cada nick del plantel, para los casos en que
 * quien carga los nicks ya sabe qué línea juega cada uno.
 *
 * Le gana a lo deducido —ver `assign_team_member_role()` y el comentario de
 * `supabase/migrations/0020_asignar_posicion.sql`— y se puede limpiar pasando
 * `null`, que es como se deshace una asignación equivocada.
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
