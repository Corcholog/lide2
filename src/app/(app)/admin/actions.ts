'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth'
import { setMatchBans, type BanInput, type SaveBansResult } from '@/lib/bans/service'
import { championIndex, resolveChampion } from '@/lib/champions/catalog'
import { assetVersion, championCatalog, roflKey } from '@/lib/ddragon'
import { getStorage } from '@/lib/storage'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Links an uploaded match to its fixture matchup.
 *
 * The logic lives in `assign_match_to_fixture()`, which validates the matchup,
 * resolves which side is which, updates the match and registers new players in
 * one call, so a failure cannot leave it half-applied.
 *
 * The `prevState` parameter is required by `useActionState`, which lets the
 * form show the server's error. Returned messages are Spanish because the
 * panel shows them as-is.
 */

function refresh() {
  revalidatePath('/admin')
  revalidatePath('/admin/asignar')
  revalidatePath('/admin/planteles')
  revalidatePath('/partidas')
  revalidatePath('/equipos')
  revalidatePath('/estadisticas')
  revalidatePath('/estadisticas/tablas')
  revalidatePath('/')
}

export interface AssignResult {
  ok: boolean
  error?: string
  /** Players registered in a team for the first time. */
  learned?: number
  /** Players already on another team; they are not moved automatically. */
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

export interface WalkoverResult {
  ok: boolean
  error?: string
  /** The team the matchup was awarded to. */
  winner?: string
  /** The team that did not turn up. */
  absent?: string
  matchday?: number
  /** The walkover was cleared rather than set. */
  cleared?: boolean
}

/**
 * Awards a matchup because a team did not turn up within the 15 minutes the
 * rules allow.
 *
 * Stored on the fixture instead of as a fake match, so the match list, records
 * and champion stats never see a game that was not played. See
 * `supabase/migrations/0024_no_presentado.sql`. An empty value clears it, so a
 * mistake can be undone from the panel.
 */
export async function setWalkoverAction(
  _prev: WalkoverResult | null,
  formData: FormData,
): Promise<WalkoverResult> {
  await requireUser()

  const fixtureId = String(formData.get('fixtureId') ?? '')
  if (!fixtureId) return { ok: false, error: 'Falta el cruce.' }

  const winnerTeamId = String(formData.get('winnerTeamId') ?? '') || null

  const { data, error } = await createAdminClient().rpc('set_fixture_walkover', {
    p_fixture_id: fixtureId,
    p_winner_team_id: winnerTeamId,
  })

  if (error) return { ok: false, error: error.message }

  const result = data as WalkoverResult
  if (result.ok) refresh()

  return result
}

export interface RulingResult {
  ok: boolean
  error?: string
  /** The team the organizers gave the matchup to. */
  winner?: string
  /** The sanctioned team. */
  sanctioned?: string
  ruling?: string
  /** Whether a played match got annulled with it. */
  annulled_match?: boolean
  /** The ruling was cleared rather than set. */
  cleared?: boolean
}

/**
 * Overturns a played result by ruling (ineligible lineup).
 *
 * Not a walkover: that requires unlinking the match, which would then be
 * counted again from its file labels. This keeps the match, annuls it for all
 * statistics and awards the matchup. See
 * `supabase/migrations/0031_alineacion_indebida.sql`. An empty value clears it
 * and the played result counts again.
 */
export async function setRulingAction(
  _prev: RulingResult | null,
  formData: FormData,
): Promise<RulingResult> {
  await requireUser()

  const fixtureId = String(formData.get('fixtureId') ?? '')
  if (!fixtureId) return { ok: false, error: 'Falta el cruce.' }

  const winnerTeamId = String(formData.get('winnerTeamId') ?? '') || null
  const ruling = String(formData.get('ruling') ?? '') || 'alineacion_indebida'

  const { data, error } = await createAdminClient().rpc('set_fixture_ruling', {
    p_fixture_id: fixtureId,
    p_winner_team_id: winnerTeamId,
    p_ruling: ruling,
  })

  if (error) return { ok: false, error: error.message }

  const result = data as RulingResult
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

/**
 * Saves a match's draft entered by hand.
 *
 * Fields arrive as `ban-<side>-<slot>`; empty ones are skipped (a skipped ban).
 * The form uses display names ("Wukong") and the .rofl key ("MonkeyKing") is
 * stored, since `champion_meta` joins picks on it. An unresolvable champion
 * aborts the save with the typed text in the error.
 */
export async function saveBansAction(
  _prev: SaveBansResult | null,
  formData: FormData,
): Promise<SaveBansResult> {
  const user = await requireUser()

  const matchId = String(formData.get('matchId') ?? '')
  if (!matchId) return { ok: false, error: 'Falta la partida.' }

  const index = championIndex(await championCatalog(await assetVersion(null)))
  const bans: BanInput[] = []

  for (const side of [100, 200] as const) {
    for (let slot = 1; slot <= 5; slot++) {
      const typed = String(formData.get(`ban-${side}-${slot}`) ?? '').trim()
      if (!typed) continue

      const champion = resolveChampion(index, typed)
      if (!champion) return { ok: false, error: `"${typed}" no es ningún campeón.` }

      bans.push({ side, orderIndex: slot, champion: roflKey(champion) })
    }
  }

  const result = await setMatchBans(matchId, bans, user.id)

  if (result.ok) {
    refresh()
    revalidatePath('/admin/bans')
  }

  return result
}

export interface DeleteResult {
  ok: boolean
  error?: string
  /** .rofl files the match had. */
  files?: number
  /** Accounts deleted with it, which only existed because of this match. */
  players?: string[]
}

/**
 * Deletes a match uploaded by mistake.
 *
 * Storage files are deleted first: if that fails the database is untouched and
 * it can be retried, whereas the reverse order could leave orphaned files.
 * `delete_match()` removes the rest, including accounts that only existed for
 * this match. See `supabase/migrations/0016_borrar_partida.sql`.
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
      const detail = error instanceof Error ? error.message : 'error desconocido'
      return { ok: false, error: `No se pudo borrar el replay del bucket: ${detail}` }
    }
  }

  const { data, error } = await supabase.rpc('delete_match', { p_match_id: matchId })
  if (error) return { ok: false, error: error.message }

  const result = data as DeleteResult
  if (result.ok) refresh()

  return result
}
