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
  relinkAllMatches,
  removePlayerFromTeam,
  type AssignAccountResult,
  type AssignRoleResult,
  type TeamToCreate,
} from '@/lib/teams/service'

function refresh() {
  revalidatePath('/equipos')
  // The player listing no longer exists; its table lives under the stats.
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
    // Only the teams that are ticked and named get created.
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
  /** The Riot ID: as stored when it went well, as typed when it did not. */
  nick?: string
  /** The account did not exist: created without a PUUID until it shows up in a replay. */
  created?: boolean
  /** Matches the account already had. */
  games?: number
}

/**
 * Adding a nick to a team's roster by hand.
 *
 * What is needed before matchday 1: until something is played there is no
 * account to add, because `players` fills itself from the replays. With this
 * the team page's roster can be completed on signup day.
 *
 * It returns the result instead of throwing - unlike the other actions on this
 * page - because here the error is part of normal use: the nick is already on
 * the roster, it already plays for another team, or the bare name is ambiguous.
 * That is shown next to the field and not on an error screen.
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
 * Matching a signup with one of the roster's accounts.
 *
 * It is on the team page and not only on /admin/planteles because that is where
 * the nicks get entered: whoever types them one by one knows whose each one is,
 * and making them go to another screen to repeat it is the surest way for it
 * never to happen. The one over there still exists and saves the whole roster
 * at once.
 *
 * It returns the result instead of throwing, like `addAccountAction` and for
 * the same reason: rejections are part of normal use - that account is already
 * somebody else's signup - and they are shown next to the dropdown.
 */
export async function assignAccountAction(
  _prev: AssignAccountResult | null,
  formData: FormData,
): Promise<AssignAccountResult> {
  await requireUser()

  const teamId = String(formData.get('teamId') ?? '')
  const rosterId = String(formData.get('rosterId') ?? '')
  if (!teamId || !rosterId) return { ok: false, error: 'Falta el inscripto.' }

  // The dropdown's empty value is "unmatched", which here means taking away
  // the account they had: it is the only way to undo a wrong match.
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
 * Assigning a roster account's lane by hand.
 *
 * It sits beside every nick under "Plantel" on the team page, which is where
 * the slot they landed in through the matches played is already shown (or "Sin
 * posición" when they have played none). The dropdown sends an empty value for
 * "unassigned", which is how an assignment is undone.
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
