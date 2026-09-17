'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth'
import { planRosterEdit, readRosterForm, type RosterCurrentRow } from '@/lib/roster/edit'
import { matchRosterLines, type RosterCandidate, type RosterImportResult } from '@/lib/roster/import'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { RosterStatusRow } from '@/types/db'

/**
 * Roster editing: who is signed up, and which Riot account each signup is.
 *
 *   - Signups: add, remove and edit (saveTeamRosterAction).
 *   - Accounts: paste the list sent by the organizers (importRosterAction), type
 *     a Riot ID, or pick an account that already played for the team.
 *
 * An admin always decides which account belongs to whom; the only automatic
 * step is the exact Riot ID match in `link_roster_accounts()`.
 */

function refresh() {
  revalidatePath('/admin/planteles')
  revalidatePath('/estadisticas')
  revalidatePath('/equipos')
}

export interface RosterActionResult {
  ok: boolean
  error?: string
  /** Signups that were rewritten. */
  saved?: number
  /** Signups added. */
  added?: number
  /** Signups removed. */
  removed?: number
  /** Signups that ended up linked to an account. */
  linked?: number
  imported?: RosterImportResult
}

/**
 * Saves a team's whole roster in one submit.
 *
 * The form sends every row; `planRosterEdit` compares it with the stored roster,
 * decides what to delete, update and create, and rejects the form if the roster
 * changed in the meantime.
 */
export async function saveTeamRosterAction(
  _prev: RosterActionResult | null,
  formData: FormData,
): Promise<RosterActionResult> {
  await requireUser()

  const teamId = String(formData.get('teamId') ?? '')
  if (!teamId) return { ok: false, error: 'Falta el equipo.' }

  const supabase = createAdminClient()

  // Read the current roster instead of trusting the browser: the form may be
  // stale, and the ids decide what gets overwritten.
  const { data: stored, error: readError } = await supabase
    .from('team_roster')
    .select('id,order_index')
    .eq('team_id', teamId)

  if (readError) return { ok: false, error: readError.message }

  const current: RosterCurrentRow[] = (stored ?? []).map((row) => ({
    id: row.id as string,
    orderIndex: row.order_index as number,
  }))

  const plan = planRosterEdit(teamId, readRosterForm(formData), current)
  if (!plan.ok) return { ok: false, error: plan.error }

  if (plan.remove.length > 0) {
    const { error } = await supabase.from('team_roster').delete().in('id', plan.remove)
    if (error) return { ok: false, error: error.message }
  }

  // Clear accounts before assigning them: two rows swapping accounts would
  // otherwise hit the unique index on player_id.
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

  // Link the saved rows to existing accounts where the Riot ID matches.
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
 * Imports a pasted list of Riot IDs into the signups. Uses the user's session
 * rather than the secret key, so reading legal names goes through RLS.
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
