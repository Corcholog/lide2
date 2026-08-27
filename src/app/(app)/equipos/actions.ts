'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import {
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
