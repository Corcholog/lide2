/**
 * Roster changes, before the tournament starts.
 *
 * The signup sheet is not final: somebody drops out, a substitute comes in,
 * another signed up with their name misspelled. Until now the admin panel only
 * knew how to match signups with Riot accounts; the signups themselves came
 * from the seed and there was no way to touch them without going into the
 * Supabase SQL editor.
 *
 * This file is the part that can be tested without a database: read a team's
 * form and decide what gets removed, what gets updated and what gets created.
 * `saveTeamRosterAction` does the writing.
 *
 * Two rules worth knowing before touching it:
 *
 * 1. THE FORM SENDS THE WHOLE ROSTER, not the change. If what arrives does not
 *    cover exactly the rows the database holds right now, nothing is written:
 *    it means the roster was edited in another tab, and applying a stale form
 *    on top would remove somebody nobody touched.
 *
 * 2. `order_index` IS NOT RECOMPACTED on removal. It is the signup sheet's
 *    order and it has a unique-per-team constraint, so renumbering the
 *    remaining rows would mean moving them in two passes to avoid colliding
 *    with that index halfway through. The only gain would be gapless
 *    numbering, and the pages number by position in the list and not by this
 *    field.
 *
 * The form field names stay in Spanish: they are the names the markup in
 * `RosterTeam.tsx` writes, and both sides have to agree on them.
 */

import { parseRiotId } from '@/lib/format'

/** One form row, exactly as the browser sends it. */
export interface RosterFormRow {
  /** The signup's id, or `nuevo-N` while the row does not exist in the database. */
  key: string
  /** Whether it does not exist yet: it is created instead of updated. */
  isNew: boolean
  /** The "quitar" box is ticked: it is removed on save. */
  removed: boolean
  fullName: string
  universityId: string
  /** The Riot ID typed by hand, "Name#TAG". */
  riot: string
  /** The account picked from the dropdown. */
  playerId: string
}

/** A signup as the database holds it today. No name: it is not needed. */
export interface RosterCurrentRow {
  id: string
  orderIndex: number
}

/** A row ready to be written into `team_roster`. */
export interface RosterWriteRow {
  team_id: string
  full_name: string
  university_id: string | null
  order_index: number
  riot_game_name: string | null
  riot_tag_line: string | null
  player_id: string | null
}

export type RosterPlan =
  | { ok: false; error: string }
  | {
      ok: true
      /** Ids to delete from `team_roster`. */
      remove: string[]
      /** The ones that already existed, with their id. */
      update: (RosterWriteRow & { id: string })[]
      /** The ones being added. No id: the database assigns it. */
      create: RosterWriteRow[]
    }

/**
 * Collects the form's rows.
 *
 * Every signup sends a hidden `fila-<key>` plus its fields carrying that same
 * key. The hidden one is what defines which rows exist: the `<input>`s of a row
 * ticked for removal might not arrive, and an unticked `<checkbox>` never does.
 *
 * The order is the form's, which is the screen's.
 */
export function readRosterForm(formData: FormData): RosterFormRow[] {
  const field = (name: string, key: string) => String(formData.get(`${name}-${key}`) ?? '').trim()

  const rows: RosterFormRow[] = []
  for (const name of formData.keys()) {
    if (!name.startsWith('fila-')) continue
    const key = name.slice('fila-'.length)

    rows.push({
      key,
      isNew: String(formData.get(name)) === 'nuevo',
      removed: formData.get(`baja-${key}`) !== null,
      fullName: field('nombre', key),
      universityId: field('universidad', key),
      riot: field('riot', key),
      playerId: field('player', key),
    })
  }

  return rows
}

/** A new row nobody touched: the "Agregar" button and nothing else. */
function isBlank(row: RosterFormRow): boolean {
  return !row.fullName && !row.riot && !row.playerId
}

export function planRosterEdit(
  teamId: string,
  form: RosterFormRow[],
  current: RosterCurrentRow[],
): RosterPlan {
  const existing = new Map(current.map((row) => [row.id, row]))

  const remove: string[] = []
  const update: (RosterWriteRow & { id: string })[] = []
  const create: RosterWriteRow[] = []
  const seen = new Set<string>()

  // New rows go at the end. See rule 2 above: the highest index in use is taken
  // and not the row count, because removals leave gaps behind.
  let nextIndex = current.reduce((max, row) => Math.max(max, row.orderIndex), -1) + 1

  for (const row of form) {
    if (row.isNew && isBlank(row)) continue

    const current_ = row.isNew ? null : existing.get(row.key)

    if (!row.isNew) {
      if (!current_) {
        return { ok: false, error: 'El plantel cambió mientras lo editabas. Recargá la página.' }
      }
      seen.add(row.key)

      if (row.removed) {
        remove.push(row.key)
        continue
      }
    }

    if (!row.fullName) {
      return { ok: false, error: 'Hay un inscripto sin nombre. Escribilo o quitá la fila.' }
    }

    const riot = parseRiotId(row.riot)
    const write: RosterWriteRow = {
      team_id: teamId,
      full_name: row.fullName,
      university_id: row.universityId || null,
      order_index: current_ ? current_.orderIndex : nextIndex++,
      riot_game_name: riot?.gameName ?? null,
      riot_tag_line: riot?.tagLine ?? null,
      player_id: row.playerId || null,
    }

    if (current_) update.push({ ...write, id: current_.id })
    else create.push(write)
  }

  // An account belongs to one person only: a unique index guarantees that, but
  // picking the same one twice is a slip of the finger, not a database error,
  // and it is worth saying before anything is written.
  const accounts = [...update, ...create].flatMap((row) => (row.player_id ? [row.player_id] : []))
  if (new Set(accounts).size !== accounts.length) {
    return { ok: false, error: 'Hay una misma cuenta elegida para dos inscriptos.' }
  }

  // See rule 1: the form has to cover the whole roster. If a row that exists is
  // missing from it, the form is stale and nothing is applied.
  if (seen.size !== current.length) {
    return { ok: false, error: 'El plantel cambió mientras lo editabas. Recargá la página.' }
  }

  return { ok: true, remove, update, create }
}
