'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth'
import { setMatchBans, type BanInput, type SaveBansResult } from '@/lib/bans/service'
import { championIndex, resolveChampion } from '@/lib/champions/catalog'
import { assetVersion, championCatalog, roflKey } from '@/lib/ddragon'
import { getStorage } from '@/lib/storage'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Hooking an uploaded match up with its fixture matchup.
 *
 * All the logic lives in `assign_match_to_fixture()` and not here: it validates
 * the matchup, resolves the orientation, updates the match and registers the
 * new players, all in one call. Doing that with five updates from here would
 * mean an error halfway leaves the match attached to the matchup but without
 * teams.
 *
 * The signature with `prevState` in front is what `useActionState` requires,
 * which is what allows showing the server's error next to the form instead of
 * throwing an exception.
 *
 * The messages returned stay in Spanish: they are read as-is in the panel.
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
  /** The ones already playing for another team: they are not moved on their own. */
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

/**
 * Entering a match's draft by hand.
 *
 * The ten fields arrive as `ban-<side>-<slot>`; empty ones are skipped, which
 * is how a match where a team passed on a ban gets entered.
 *
 * THE TRANSLATION HAPPENS HERE. The form takes the display name ("Wukong"), and
 * what gets stored is the key the .rofl uses ("MonkeyKing"), because that is
 * what `champion_meta` joins the picks against. A champion that cannot be
 * resolved aborts the save naming the text: storing it as typed would leave a
 * ghost row in the meta that nobody will be able to explain later.
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
  /** Accounts that went with it: they only existed because of this match. */
  players?: string[]
}

/**
 * Deleting a match uploaded by mistake.
 *
 * The order is deliberate: the bucket's .rofl files first and the database
 * after. If the bucket fails, the database is untouched and it can be retried;
 * the other way round would leave 15 MB files with no row naming them,
 * invisible until somebody looks at the storage. It is the same order as
 * `scripts/purge-leif.ts`.
 *
 * `delete_match()` decides everything else: what goes by cascade and which
 * accounts existed only for this match. See
 * `supabase/migrations/0016_borrar_partida.sql`.
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
