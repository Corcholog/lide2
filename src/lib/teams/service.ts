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
