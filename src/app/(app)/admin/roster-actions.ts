'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth'
import { planRosterEdit, readRosterForm, type RosterCurrentRow } from '@/lib/roster/edit'
import { matchRosterLines, type RosterCandidate, type RosterImportResult } from '@/lib/roster/import'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { RosterStatusRow } from '@/types/db'

/**
 * The rosters: who is signed up and which Riot account each one is.
 *
 * Two different things living in the same form because they are done at the
 * same moment:
 *
 *   - WHO. Adding, removing and editing signups (saveTeamRosterAction). The
 *     signup sheet is not final: until the tournament starts people drop out,
 *     substitutes come in and names get corrected.
 *   - WHICH ACCOUNT. The matching against `players`, by three routes from the
 *     most convenient to the most manual: pasting the list the organizers send
 *     (importRosterAction), typing the Riot ID one at a time, or picking by
 *     hand one of the accounts that already played for that team (the last two
 *     share the form with the additions).
 *
 * Whoever decides which account belongs to whom is always a person. The only
 * automatic part is the exact Riot ID match, which `link_roster_accounts()`
 * does in the database.
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
  /** Signups that ended up matched with a real account. */
  linked?: number
  imported?: RosterImportResult
}

/**
 * Saves a team's whole roster at once.
 *
 * One button for the five or seven rows, and for all three operations at the
 * same time: saving one field at a time is five round trips to the server and
 * five revalidations to complete one roster.
 *
 * The form sends the complete roster - one row per signup, plus any added on
 * screen - and here it is compared against what is in the database.
 * `planRosterEdit` decides what gets deleted, updated and created, and rejects
 * the whole form if it does not match today's roster.
 */
export async function saveTeamRosterAction(
  _prev: RosterActionResult | null,
  formData: FormData,
): Promise<RosterActionResult> {
  await requireUser()

  const teamId = String(formData.get('teamId') ?? '')
  if (!teamId) return { ok: false, error: 'Falta el equipo.' }

  const supabase = createAdminClient()

  // Today's roster is read rather than trusting what the browser sends: the
  // form may have been drawn before another edit, and the `id` is the only
  // thing that decides who gets written over. Without the names: what ends up
  // stored is what the user typed, so they are not needed.
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

  // The accounts are cleared before being assigned: if two rows swap accounts,
  // writing them one at a time would collide with the unique index on player_id
  // halfway through.
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

  // And what was just written is matched against whatever accounts already
  // exist: if that person has played, they are paired up on the spot.
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
 * Paste the whole list and let it distribute itself.
 *
 * It reads with the user's session and not with the service key: `team_roster`
 * holds legal names and this action fetches all of them, so it is better that
 * it goes through RLS like the rest of the site.
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
