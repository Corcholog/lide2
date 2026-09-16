'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { parseRiotId, riotId } from '@/lib/format'
import {
  addAccountToTeam,
  addPlayerToTeam,
  assignRosterAccount,
  assignTeamMemberRole,
  createEmptyTeam,
  createTeams,
  deleteTeam,
  mergeManualAccount,
  relinkAllMatches,
  removePlayerFromTeam,
  type AssignAccountResult,
  type AssignRoleResult,
  type MergeAccountResult,
  type TeamToCreate,
} from '@/lib/teams/service'

function refresh() {
  revalidatePath('/equipos')
  // Player tables live under the stats section.
  revalidatePath('/estadisticas/tablas')
  revalidatePath('/')
}

export async function createDetectedTeamsAction(formData: FormData) {
  await requireUser()

  const teams: TeamToCreate[] = []
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith('name-')) continue

    const index = key.slice('name-'.length)
    const name = String(value).trim()
    // Only ticked teams with a name are created.
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
  /** The Riot ID: as stored on success, as typed on failure. */
  nick?: string
  /** The account did not exist and was created without a PUUID until it appears in a replay. */
  created?: boolean
  /** Matches the account already had. */
  games?: number
}

/**
 * Adds a nick to a team's roster by hand, so rosters can be completed before
 * any match is played.
 *
 * Returns the result instead of throwing: rejections (already on the roster, on
 * another team, ambiguous name) are normal and shown next to the field.
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

/**
 * Links a signup to one of the roster's accounts, from the team page where the
 * nicks are entered. /admin/planteles still saves whole rosters.
 *
 * Returns the result instead of throwing, like `addAccountAction`: rejections
 * are shown next to the dropdown.
 */
export async function assignAccountAction(
  _prev: AssignAccountResult | null,
  formData: FormData,
): Promise<AssignAccountResult> {
  await requireUser()

  const teamId = String(formData.get('teamId') ?? '')
  const rosterId = String(formData.get('rosterId') ?? '')
  if (!teamId || !rosterId) return { ok: false, error: 'Falta el inscripto.' }

  // An empty value unlinks the current account, to undo a wrong match.
  const playerId = String(formData.get('playerId') ?? '') || null

  const result = await assignRosterAccount(rosterId, playerId)
  if (!result.ok) return result

  refresh()
  revalidatePath(`/equipos/${teamId}`)
  revalidatePath('/admin/planteles')
  revalidatePath('/estadisticas')

  return result
}

/**
 * Confirms that a hand-typed nick that never played is a player's previous nick
 * (see `roster_review`).
 *
 * Never automatic: the same evidence could also mean a substitute played, and a
 * wrong merge credits matches to the wrong university. Returns the result
 * instead of throwing, like the actions above.
 */
export async function mergeAccountAction(
  _prev: MergeAccountResult | null,
  formData: FormData,
): Promise<MergeAccountResult> {
  await requireUser()

  const teamId = String(formData.get('teamId') ?? '')
  const placeholderId = String(formData.get('placeholderId') ?? '')
  const realId = String(formData.get('realId') ?? '')

  if (!teamId || !placeholderId || !realId) return { ok: false, error: 'Faltan las dos cuentas.' }

  const result = await mergeManualAccount(teamId, placeholderId, realId)
  if (!result.ok) return result

  refresh()
  revalidatePath(`/equipos/${teamId}`)
  revalidatePath('/admin/planteles')
  revalidatePath('/admin/asignar')
  revalidatePath('/estadisticas')

  return result
}

/**
 * Sets a roster account's lane by hand, from the team page. An empty value
 * clears the assignment.
 */
export async function assignRoleAction(
  _prev: AssignRoleResult | null,
  formData: FormData,
): Promise<AssignRoleResult> {
  await requireUser()

  const teamId = String(formData.get('teamId') ?? '')
  const playerId = String(formData.get('playerId') ?? '')
  if (!teamId || !playerId) return { ok: false, error: 'Falta la cuenta.' }

  const role = String(formData.get('role') ?? '') || null

  const result = await assignTeamMemberRole(teamId, playerId, role)
  if (!result.ok) return result

  refresh()
  revalidatePath(`/equipos/${teamId}`)

  return result
}
