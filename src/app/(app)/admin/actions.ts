'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth'
import { getStorage } from '@/lib/storage'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Enganchar una partida subida con su cruce del fixture.
 *
 * Toda la lógica está en `assign_match_to_fixture()` y no acá: valida el cruce,
 * resuelve la orientación, actualiza la partida y da de alta a los jugadores
 * nuevos, todo en una llamada. Si eso se hiciera con cinco updates desde acá, un
 * error a la mitad dejaría la partida enganchada al cruce pero sin equipos.
 *
 * La firma con `prevState` adelante es la que pide `useActionState`, que es lo
 * que permite mostrar el error del servidor al lado del formulario en vez de
 * tirar una excepción.
 */

function refresh() {
  revalidatePath('/admin/asignar')
  revalidatePath('/admin/planteles')
  revalidatePath('/partidas')
  revalidatePath('/equipos')
  revalidatePath('/jugadores')
  revalidatePath('/estadisticas')
  revalidatePath('/')
}

export interface AssignResult {
  ok: boolean
  error?: string
  /** Jugadores que se dieron de alta en un equipo por primera vez. */
  learned?: number
  /** Los que ya jugaban en otro equipo: no se mueven solos. */
  conflicts?: string[]
}

export async function assignMatchAction(
  _prev: AssignResult | null,
  formData: FormData,
): Promise<AssignResult> {
  await requireUser()

  const matchId = String(formData.get('matchId') ?? '')
  const fixtureId = String(formData.get('fixtureId') ?? '')
  const blueTeamId = String(formData.get('blueTeamId') ?? '')

  if (!matchId || !fixtureId) return { ok: false, error: 'Falta elegir el cruce.' }
  if (!blueTeamId) return { ok: false, error: 'Falta decir quién jugó de azul.' }

  const { data, error } = await createAdminClient().rpc('assign_match_to_fixture', {
    p_match_id: matchId,
    p_fixture_id: fixtureId,
    p_blue_team_id: blueTeamId,
  })

  if (error) return { ok: false, error: error.message }

  const result = data as AssignResult
  if (result.ok) refresh()

  return result
}

export async function unassignMatchAction(
  _prev: AssignResult | null,
  formData: FormData,
): Promise<AssignResult> {
  await requireUser()

  const matchId = String(formData.get('matchId') ?? '')
  if (!matchId) return { ok: false, error: 'Falta la partida.' }

  const { error } = await createAdminClient().rpc('unassign_match', { p_match_id: matchId })
  if (error) return { ok: false, error: error.message }

  refresh()
  return { ok: true }
}

export interface DeleteResult {
  ok: boolean
  error?: string
  /** Archivos .rofl que tenía la partida. */
  files?: number
  /** Cuentas que se fueron con ella: sólo existían por esta partida. */
  players?: string[]
}

/**
 * Borrar una partida subida por error.
 *
 * El orden es a propósito: primero los .rofl del bucket y después la base. Si
 * el bucket falla, la base queda intacta y se puede reintentar; al revés
 * quedarían archivos de 15 MB sin ninguna fila que los nombre, invisibles hasta
 * que alguien mire el storage. Es el mismo orden que `scripts/purge-leif.ts`.
 *
 * Todo lo demás lo decide `delete_match()`: qué se va por cascade y qué cuentas
 * eran sólo de esta partida. Ver `supabase/migrations/0016_borrar_partida.sql`.
 */
export async function deleteMatchAction(
  _prev: DeleteResult | null,
  formData: FormData,
): Promise<DeleteResult> {
  await requireUser()

  const matchId = String(formData.get('matchId') ?? '')
  if (!matchId) return { ok: false, error: 'Falta la partida.' }

  const supabase = createAdminClient()
  const { data: files, error: filesError } = await supabase
    .from('match_files')
    .select('storage_path')
    .eq('match_id', matchId)

  if (filesError) return { ok: false, error: filesError.message }

  const storage = await getStorage()
  for (const file of files ?? []) {
    try {
      await storage.remove(file.storage_path as string)
    } catch (error) {
      const detalle = error instanceof Error ? error.message : 'error desconocido'
      return { ok: false, error: `No se pudo borrar el replay del bucket: ${detalle}` }
    }
  }

  const { data, error } = await supabase.rpc('delete_match', { p_match_id: matchId })
  if (error) return { ok: false, error: error.message }

  const result = data as DeleteResult
  if (result.ok) refresh()

  return result
}
