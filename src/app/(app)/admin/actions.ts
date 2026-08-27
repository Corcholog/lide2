'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth'
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
