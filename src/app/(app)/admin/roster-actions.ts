'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth'
import { planRosterEdit, readRosterForm, type RosterCurrentRow } from '@/lib/roster/edit'
import { matchRosterLines, type RosterCandidate, type RosterImportResult } from '@/lib/roster/import'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { RosterStatusRow } from '@/types/db'

/**
 * Los planteles: quiénes están anotados y qué cuenta de Riot es cada uno.
 *
 * Dos cosas distintas que viven en el mismo formulario porque se hacen en el
 * mismo momento:
 *
 *   - QUIÉNES. Alta, baja y modificación de inscriptos (saveTeamRosterAction).
 *     La planilla de inscripción no es definitiva: hasta que arranque el torneo
 *     se cae gente, entran suplentes y se corrigen nombres.
 *   - QUÉ CUENTA. El emparejado con `players`, por tres caminos del más cómodo
 *     al más manual: pegar la lista que mande la organización
 *     (importRosterAction), escribir el Riot ID de a uno, o elegir a mano una de
 *     las cuentas que ya jugaron en ese equipo (los dos últimos, mismo
 *     formulario que el alta).
 *
 * Quien decide qué cuenta es de quién es siempre una persona. Lo único
 * automático es la coincidencia exacta de Riot ID, que la hace
 * `link_roster_accounts()` en la base.
 */

function refresh() {
  revalidatePath('/admin/planteles')
  revalidatePath('/estadisticas')
  revalidatePath('/equipos')
}

export interface RosterActionResult {
  ok: boolean
  error?: string
  /** Inscriptos que se volvieron a escribir. */
  saved?: number
  /** Inscriptos dados de alta. */
  added?: number
  /** Inscriptos dados de baja. */
  removed?: number
  /** Inscriptos que quedaron emparejados con una cuenta real. */
  linked?: number
  imported?: RosterImportResult
}

/**
 * Guarda el plantel de un equipo entero de una.
 *
 * Un solo botón para las cinco o siete filas, y para las tres operaciones a la
 * vez: guardar de a un campo son cinco viajes al servidor y cinco
 * revalidaciones para completar un plantel.
 *
 * El formulario manda el plantel completo —una fila por inscripto, más las que
 * se hayan agregado en pantalla— y acá se compara contra lo que hay en la base.
 * `planRosterEdit` decide qué se borra, qué se actualiza y qué se crea, y
 * rechaza el formulario entero si no coincide con el plantel de hoy.
 */
export async function saveTeamRosterAction(
  _prev: RosterActionResult | null,
  formData: FormData,
): Promise<RosterActionResult> {
  await requireUser()

  const teamId = String(formData.get('teamId') ?? '')
  if (!teamId) return { ok: false, error: 'Falta el equipo.' }

  const supabase = createAdminClient()

  // Se lee el plantel de hoy en vez de confiar en lo que manda el navegador:
  // el formulario pudo haberse dibujado antes de otra edición, y el `id` es lo
  // único que decide a quién se le escribe encima. Sin los nombres: lo que va a
  // quedar guardado es lo que escribió el usuario, así que no hacen falta.
  const { data: actual, error: readError } = await supabase
    .from('team_roster')
    .select('id,order_index')
    .eq('team_id', teamId)

  if (readError) return { ok: false, error: readError.message }

  const current: RosterCurrentRow[] = (actual ?? []).map((row) => ({
    id: row.id as string,
    orderIndex: row.order_index as number,
  }))

  const plan = planRosterEdit(teamId, readRosterForm(formData), current)
  if (!plan.ok) return { ok: false, error: plan.error }

  if (plan.remove.length > 0) {
    const { error } = await supabase.from('team_roster').delete().in('id', plan.remove)
    if (error) return { ok: false, error: error.message }
  }

  // Se limpian las cuentas antes de asignarlas: si dos filas se intercambian la
  // cuenta, escribirlas de a una chocaría contra el índice único de player_id a
  // mitad de camino.
  if (plan.update.length > 0) {
    const { error } = await supabase
      .from('team_roster')
      .update({ player_id: null })
      .in('id', plan.update.map((row) => row.id))

    if (error) return { ok: false, error: error.message }

    const { error: saveError } = await supabase
      .from('team_roster')
      .upsert(plan.update, { onConflict: 'id' })

    if (saveError) return { ok: false, error: saveError.message }
  }

  if (plan.create.length > 0) {
    const { error } = await supabase.from('team_roster').insert(plan.create)
    if (error) return { ok: false, error: error.message }
  }

  // Y se intenta cerrar lo que se acaba de escribir contra las cuentas que ya
  // existan: si la persona ya jugó, queda emparejada en el acto.
  const { data: linked } = await supabase.rpc('link_roster_accounts', { p_team_id: teamId })

  refresh()
  return {
    ok: true,
    saved: plan.update.length,
    added: plan.create.length,
    removed: plan.remove.length,
    linked:
      [...plan.update, ...plan.create].filter((row) => row.player_id).length + Number(linked ?? 0),
  }
}

/**
 * Pega la lista entera y la reparte sola.
 *
 * Se lee con la sesión del usuario y no con la clave de servicio: `team_roster`
 * tiene nombres legales y esta acción los trae todos, así que conviene que pase
 * por el RLS igual que el resto del sitio.
 */
export async function importRosterAction(
  _prev: RosterActionResult | null,
  formData: FormData,
): Promise<RosterActionResult> {
  await requireUser()

  const text = String(formData.get('lista') ?? '')
  if (!text.trim()) return { ok: false, error: 'No hay nada pegado.' }

  const reader = await createClient()
  const { data, error } = await reader
    .from('roster_status')
    .select('roster_id,full_name,team_name')
    .order('team_name')

  if (error) return { ok: false, error: error.message }

  const candidates: RosterCandidate[] = (
    (data ?? []) as Pick<RosterStatusRow, 'roster_id' | 'full_name' | 'team_name'>[]
  ).map((row) => ({
    rosterId: row.roster_id,
    fullName: row.full_name,
    teamName: row.team_name,
  }))

  const imported = matchRosterLines(text, candidates)

  const supabase = createAdminClient()
  for (const match of imported.matched) {
    const { error: saveError } = await supabase
      .from('team_roster')
      .update({ riot_game_name: match.gameName, riot_tag_line: match.tagLine })
      .eq('id', match.rosterId)

    if (saveError) return { ok: false, error: saveError.message }
  }

  const { data: linked } = await supabase.rpc('link_roster_accounts', { p_team_id: null })

  refresh()
  return { ok: true, saved: imported.matched.length, linked: Number(linked ?? 0), imported }
}
