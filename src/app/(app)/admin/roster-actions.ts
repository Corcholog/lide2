'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth'
import { parseRiotId } from '@/lib/format'
import { matchRosterLines, type RosterCandidate, type RosterImportResult } from '@/lib/roster/import'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { RosterStatusRow } from '@/types/db'

/**
 * Emparejar inscriptos con cuentas de Riot.
 *
 * Tres caminos, del más cómodo al más manual:
 *
 *   1. Pegar la lista que mande la organización (importRosterAction).
 *   2. Escribir el Riot ID de a uno, por equipo (saveTeamRosterAction).
 *   3. Elegir a mano una de las cuentas que ya jugaron en ese equipo, para los
 *      que no coincidieron por texto (saveTeamRosterAction, mismo formulario).
 *
 * En los tres, quien decide qué cuenta es de quién es una persona. Lo único
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
  /** Filas cuyo Riot ID declarado cambió. */
  saved?: number
  /** Inscriptos que quedaron emparejados con una cuenta real. */
  linked?: number
  imported?: RosterImportResult
}

/**
 * Guarda un equipo entero de una.
 *
 * El formulario manda `riot-<rosterId>` (el Riot ID escrito a mano) y
 * `player-<rosterId>` (la cuenta elegida del desplegable) por cada inscripto.
 * Un solo botón para las cinco filas: guardar de a una son cinco viajes y cinco
 * revalidaciones para completar un plantel.
 */
export async function saveTeamRosterAction(
  _prev: RosterActionResult | null,
  formData: FormData,
): Promise<RosterActionResult> {
  await requireUser()

  const rows = new Map<string, { riot: string; playerId: string }>()

  for (const [key, value] of formData.entries()) {
    const [field, rosterId] = [key.slice(0, key.indexOf('-')), key.slice(key.indexOf('-') + 1)]
    if (field !== 'riot' && field !== 'player') continue

    const current = rows.get(rosterId) ?? { riot: '', playerId: '' }
    rows.set(rosterId, { ...current, [field === 'riot' ? 'riot' : 'playerId']: String(value) })
  }

  // Una cuenta es de una sola persona: hay un índice único que lo garantiza,
  // pero elegir la misma dos veces es un error de dedo, no un error de base, y
  // conviene decirlo antes de escribir nada.
  const chosen = [...rows.values()].map((row) => row.playerId).filter(Boolean)
  if (new Set(chosen).size !== chosen.length) {
    return { ok: false, error: 'Hay una misma cuenta elegida para dos inscriptos.' }
  }

  const supabase = createAdminClient()

  // Se limpia antes de asignar: si dos filas se intercambian las cuentas, hacer
  // los updates de a uno chocaría contra el índice único a mitad de camino.
  const { error: clearError } = await supabase
    .from('team_roster')
    .update({ player_id: null })
    .in('id', [...rows.keys()])

  if (clearError) return { ok: false, error: clearError.message }

  let saved = 0
  let linked = 0

  for (const [rosterId, row] of rows) {
    const parsed = parseRiotId(row.riot)

    const { error } = await supabase
      .from('team_roster')
      .update({
        riot_game_name: parsed?.gameName ?? null,
        riot_tag_line: parsed?.tagLine ?? null,
        player_id: row.playerId || null,
      })
      .eq('id', rosterId)

    if (error) return { ok: false, error: error.message }
    saved++
    if (row.playerId) linked++
  }

  // Y se intenta cerrar lo que se acaba de escribir contra las cuentas que ya
  // existan: si la persona ya jugó, queda emparejada en el acto.
  const teamId = String(formData.get('teamId') ?? '')
  const { data } = await supabase.rpc('link_roster_accounts', { p_team_id: teamId || null })

  refresh()
  return { ok: true, saved, linked: linked + Number(data ?? 0) }
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
