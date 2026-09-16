/**
 * Roster edits from the admin panel: add, update and remove signups.
 *
 * This is the database-free part: read a team's form and decide what to
 * remove, update and create. `saveTeamRosterAction` does the writing.
 *
 * Two rules:
 *
 * 1. The form sends the whole roster, not a diff. If it does not cover exactly
 *    the rows currently in the database, nothing is written: the roster was
 *    edited elsewhere, and applying a stale form could remove someone.
 *
 * 2. `order_index` is not renumbered on removal. It has a unique-per-team
 *    constraint, so renumbering would need two passes, and pages number rows
 *    by list position anyway.
 *
 * Form field names are Spanish and must match the markup in `RosterTeam.tsx`.
 */

import { parseRiotId } from '@/lib/format'

/** One form row, exactly as the browser sends it. */
export interface RosterFormRow {
  /** The signup's id, or `nuevo-N` while the row does not exist in the database. */
  key: string
  /** True when the row is new and must be created. */
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

/** A signup as currently stored; only what the plan needs. */
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
      /** Existing rows, with their id. */
      update: (RosterWriteRow & { id: string })[]
      /** New rows; the database assigns the id. */
      create: RosterWriteRow[]
    }

/**
 * Reads the form rows, in screen order.
 *
 * Each signup sends a hidden `fila-<key>` input, which is what defines the row:
 * inputs of a row marked for removal may be missing, and unchecked checkboxes
 * are never sent.
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

/** A new row left empty. */
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

  // New rows go at the end, after the highest index in use (removals leave
  // gaps, so the row count is not enough). See rule 2.
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

  // A unique index already enforces one signup per account, but a clear
  // message is better than a database error.
  const accounts = [...update, ...create].flatMap((row) => (row.player_id ? [row.player_id] : []))
  if (new Set(accounts).size !== accounts.length) {
    return { ok: false, error: 'Hay una misma cuenta elegida para dos inscriptos.' }
  }

  // Rule 1: every existing row must be in the form.
  if (seen.size !== current.length) {
    return { ok: false, error: 'El plantel cambió mientras lo editabas. Recargá la página.' }
  }

  return { ok: true, remove, update, create }
}
