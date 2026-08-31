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

/**
 * Emparejar un inscripto con una de las cuentas del plantel.
 *
 * Está en la ficha del equipo y no sólo en /admin/planteles porque es ahí donde
 * se cargan los nicks: quien los escribe uno por uno sabe de quién es cada uno,
 * y hacerlo ir a otra pantalla a repetirlo es la forma más segura de que no se
 * haga nunca. El de allá sigue existiendo y guarda el plantel entero de una.
 *
 * Devuelve el resultado en vez de tirar excepción, igual que `addAccountAction`
 * y por lo mismo: los rechazos son parte del uso normal —esa cuenta ya es de
 * otro inscripto— y se muestran al lado del desplegable.
 */
export async function assignAccountAction(
  _prev: AssignAccountResult | null,
  formData: FormData,
): Promise<AssignAccountResult> {
  await requireUser()

  const teamId = String(formData.get('teamId') ?? '')
  const rosterId = String(formData.get('rosterId') ?? '')
  if (!teamId || !rosterId) return { ok: false, error: 'Falta el inscripto.' }

  // El vacío del desplegable es "sin emparejar", que acá es sacarle la cuenta
  // que tenía: es la única forma de deshacer un emparejado equivocado.
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
 * Asignar a mano la línea de una cuenta del plantel.
 *
 * Está junto a cada nick del "Plantel" en la ficha del equipo, que es donde ya
 * se ve el casillero que le tocó por las partidas jugadas (o "Sin posición" si
 * todavía no jugó ninguna). El desplegable manda vacío para "sin asignar", que
 * es la forma de deshacer una asignación.
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
