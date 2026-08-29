'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { parseRiotId, riotId } from '@/lib/format'
import {
  addAccountToTeam,
  addPlayerToTeam,
  createEmptyTeam,
  createTeams,
  deleteTeam,
  relinkAllMatches,
  removePlayerFromTeam,
  type TeamToCreate,
} from '@/lib/teams/service'

function refresh() {
  revalidatePath('/equipos')
  revalidatePath('/jugadores')
  revalidatePath('/')
}

export async function createDetectedTeamsAction(formData: FormData) {
  await requireUser()

  const teams: TeamToCreate[] = []
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith('name-')) continue

    const index = key.slice('name-'.length)
    const name = String(value).trim()
    // Sólo se crean los equipos tildados y con nombre.
    if (!name || formData.get(`include-${index}`) !== 'on') continue

    teams.push({ name, puuids: String(formData.get(`puuids-${index}`) ?? '').split(',').filter(Boolean) })
  }

  const created = await createTeams(teams)
  refresh()
  redirect(`/equipos?creados=${created}`)
}

export async function createTeamAction(formData: FormData) {
  await requireUser()
  const name = String(formData.get('name') ?? '').trim()
  if (name) await createEmptyTeam(name)
  refresh()
}

export async function deleteTeamAction(formData: FormData) {
  await requireUser()
  await deleteTeam(String(formData.get('teamId')))
  refresh()
  redirect('/equipos')
}

export async function addPlayerAction(formData: FormData) {
  await requireUser()
  const teamId = String(formData.get('teamId'))
  await addPlayerToTeam(teamId, String(formData.get('playerId')))
  refresh()
  revalidatePath(`/equipos/${teamId}`)
}

export async function removePlayerAction(formData: FormData) {
  await requireUser()
  const teamId = String(formData.get('teamId'))
  await removePlayerFromTeam(teamId, String(formData.get('playerId')))
  refresh()
  revalidatePath(`/equipos/${teamId}`)
}

export async function relinkAction() {
  await requireUser()
  await relinkAllMatches()
  refresh()
}

export interface AccountResult {
  ok: boolean
  error?: string
  /** El Riot ID: como quedó cargado si salió bien, tal como se escribió si no. */
  nick?: string
  /** La cuenta no existía: se creó sin PUUID hasta que aparezca en un replay. */
  created?: boolean
  /** Partidas que la cuenta ya tenía. */
  games?: number
}

/**
 * Cargar un nick a mano en el plantel de un equipo.
 *
 * Lo que hace falta antes de la fecha 1: hasta que se juegue algo no hay
 * ninguna cuenta que agregar, porque `players` se llena desde los replays. Con
 * esto el plantel de la ficha se puede completar el día de la inscripción.
 *
 * Devuelve el resultado en vez de tirar excepción —a diferencia de las otras
 * acciones de esta página— porque acá el error es parte del uso normal: el nick
 * ya está en el plantel, ya juega en otro equipo, o el nombre suelto es
 * ambiguo. Eso se muestra al lado del campo y no en una pantalla de error.
 */
export async function addAccountAction(
  _prev: AccountResult | null,
  formData: FormData,
): Promise<AccountResult> {
  await requireUser()

  const teamId = String(formData.get('teamId') ?? '')
  if (!teamId) return { ok: false, error: 'Falta el equipo.' }

  const escrito = String(formData.get('riot') ?? '').trim()
  const riot = parseRiotId(escrito)
  if (!riot) return { ok: false, error: 'Escribí el nick, con o sin #TAG.' }

  const result = await addAccountToTeam(teamId, riot.gameName, riot.tagLine)
  if (!result.ok) return { ...result, nick: escrito }

  refresh()
  revalidatePath(`/equipos/${teamId}`)

  return { ...result, nick: riotId(riot.gameName, riot.tagLine) }
}
