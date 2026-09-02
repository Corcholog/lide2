'use client'

import { useActionState, useId, useState } from 'react'
import { saveTeamRosterAction, type RosterActionResult } from '@/app/(app)/admin/roster-actions'
import { riotId } from '@/lib/format'
import type { RosterStatusRow, TeamAccountRow } from '@/types/db'

/**
 * A team's roster: who is signed up and which account each one is.
 *
 * One form and one button for the five or seven rows. Saving one at a time is
 * five round trips to the server and five page reloads to complete a roster,
 * and on top of that additions and removals have to travel together: the server
 * compares the whole form against the roster in the database and rejects the
 * lot if they do not match (see `planRosterEdit`).
 *
 * Removals and additions are not applied until save. "Quitar" strikes the row
 * through and sends it marked; "Agregar" draws a row that does not exist in the
 * database yet. That way a mis-ticked removal is undone with another click and
 * not with an undo.
 *
 * Every signup has two ways of getting matched, and they coexist on purpose:
 * the typed Riot ID (which works even if that person has never played, and
 * resolves itself when they turn up) and the accounts dropdown (which works
 * when the declared Riot ID does not match the one they actually used).
 *
 * The form field names stay in Spanish: `readRosterForm` reads them by those
 * exact names.
 */

export interface UniversityOption {
  id: string
  tag: string
  name: string
}

const FIELD =
  'border-2 border-line-strong bg-raised px-2 py-1.5 text-sm focus:border-accent'

/** A row's five columns, the same in the header and in every signup. */
const COLUMNS =
  'sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.2fr)_auto]'

export function RosterTeam({
  team,
  rows,
  accounts,
  universities,
}: {
  team: { id: string; name: string; groupLabel: string | null }
  rows: RosterStatusRow[]
  accounts: TeamAccountRow[]
  universities: UniversityOption[]
}) {
  const [state, formAction, pending] = useActionState<RosterActionResult | null, FormData>(
    saveTeamRosterAction,
    null,
  )

  const linked = rows.filter((row) => row.player_id !== null).length
  const declared = rows.filter((row) => row.declared_game_name !== null).length

  return (
    <form action={formAction} className="flex flex-col border-2 border-line bg-surface text-fg">
      <input type="hidden" name="teamId" value={team.id} />

      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b-2 border-line px-4 py-3">
        <h3 className="font-display text-sm uppercase tracking-wide">
          {team.name}
          {team.groupLabel && <span className="ml-2 text-faint">{team.groupLabel}</span>}
        </h3>
        <p className="text-xs text-muted">
          <span className="text-faint">{rows.length} signups · </span>
          <span className={linked === rows.length && rows.length > 0 ? 'text-ok' : ''}>
            {linked}/{rows.length} emparejados
          </span>
          {declared > linked && ` · ${declared - linked} esperando que jueguen`}
        </p>
      </header>

      {/*
        The `key` is the signups that exist today, so a saved addition or
        removal remounts the list and clears the previous round's marks: the new
        rows already exist in the database and came back through `rows`, and
        sending them again would save them twice. A save that fails does not
        change the key and leaves everything as it was, which is what it takes
        to fix and retry.
      */}
      <Rows
        key={rows.map((row) => row.roster_id).join(',')}
        rows={rows}
        accounts={accounts}
        universities={universities}
      />

      <footer className="flex flex-wrap items-center gap-3 border-t-2 border-line px-4 py-3">
        <button
          type="submit"
          disabled={pending}
          className="bg-accent-strong px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:bg-line-strong disabled:text-muted"
        >
          {pending ? 'Guardando…' : 'Guardar'}
        </button>

        {state?.error && (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        )}
        {state?.ok && <p className="text-sm text-ok">{summarize(state)}</p>}
      </footer>
    </form>
  )
}

/** What happened on save, without listing the zeroes. */
function summarize(state: RosterActionResult): string {
  const parts = [
    state.added ? `${state.added} de alta` : null,
    state.removed ? `${state.removed} de baja` : null,
    state.linked ? `${state.linked} emparejados` : null,
  ].filter(Boolean)

  return parts.length > 0 ? `Guardado · ${parts.join(' · ')}` : 'Guardado'
}

/**
 * What to say below the dropdown. An account matched with 0 games is not an
 * error: it is a nick entered by hand that has not played yet (see 0017).
 */
function noteFor(row: RosterStatusRow): string | null {
  if (!row.player_id) return null
  return row.games > 0 ? `${row.games} partidas` : 'todavía no jugó'
}

/** The roster's rows, with whatever was added and removed but not yet saved. */
function Rows({
  rows,
  accounts,
  universities,
}: {
  rows: RosterStatusRow[]
  accounts: TeamAccountRow[]
  universities: UniversityOption[]
}) {
  const prefix = useId()
  const [added, setAdded] = useState<string[]>([])
  const [removed, setRemoved] = useState<string[]>([])

  const markedForRemoval = new Set(removed)

  return (
    <>
      {/* The labels go once at the very top and not on every row. On a narrow
          screen the row stacks and they would correspond to nothing, so they
          hide and the `sr-only` each field carries takes over. */}
      <div
        className={`hidden gap-2 border-b-2 border-line px-4 py-2 text-[11px] uppercase tracking-wide text-faint sm:grid ${COLUMNS}`}
      >
        <span>Nombre</span>
        <span>Universidad</span>
        <span>Riot ID de la planilla</span>
        <span>Nick del plantel</span>
        <span className="w-14" />
      </div>

      <ul className="divide-y divide-line">
        {rows.map((row) => (
          <Row
            key={row.roster_id}
            rowKey={row.roster_id}
            fullName={row.display_name ?? row.full_name}
            universityId={row.university_id}
            riot={
              row.declared_game_name ? riotId(row.declared_game_name, row.declared_tag_line) : ''
            }
            playerId={row.player_id}
            note={noteFor(row)}
            accounts={accounts}
            universities={universities}
            removed={markedForRemoval.has(row.roster_id)}
            onToggle={() =>
              setRemoved((previous) =>
                previous.includes(row.roster_id)
                  ? previous.filter((id) => id !== row.roster_id)
                  : [...previous, row.roster_id],
              )
            }
          />
        ))}

        {added.map((key) => (
          <Row
            key={key}
            rowKey={key}
            isNew
            fullName=""
            universityId={null}
            riot=""
            playerId={null}
            note="alta sin guardar"
            accounts={accounts}
            universities={universities}
            removed={false}
            onToggle={() => setAdded((previous) => previous.filter((id) => id !== key))}
          />
        ))}

        {rows.length === 0 && added.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-faint">
            Este equipo no tiene inscriptos cargados.
          </li>
        )}
      </ul>

      <div className="border-t-2 border-dashed border-line px-4 py-2">
        <button
          type="button"
          onClick={() => setAdded((previous) => [...previous, `nuevo-${prefix}-${previous.length}`])}
          className="text-xs uppercase tracking-wide text-muted transition-colors hover:text-accent"
        >
          + Agregar signup
        </button>
      </div>
    </>
  )
}

function Row({
  rowKey,
  isNew,
  fullName,
  universityId,
  riot,
  playerId,
  note,
  accounts,
  universities,
  removed,
  onToggle,
}: {
  rowKey: string
  isNew?: boolean
  fullName: string
  universityId: string | null
  riot: string
  playerId: string | null
  note: string | null
  accounts: TeamAccountRow[]
  universities: UniversityOption[]
  removed: boolean
  onToggle: () => void
}) {
  return (
    <li className={`grid gap-2 px-4 py-3 ${COLUMNS} ${removed ? 'bg-danger-dim' : ''}`}>
      {/* This hidden field is what defines which rows the form sends: a row's
          fields can arrive empty, but this one always travels. */}
      <input type="hidden" name={`fila-${rowKey}`} value={isNew ? 'nuevo' : 'existente'} />
      {removed && <input type="hidden" name={`baja-${rowKey}`} value="1" />}

      <label className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-wide text-faint sm:sr-only">Nombre</span>
        <input
          name={`nombre-${rowKey}`}
          defaultValue={fullName}
          placeholder="Nombre y apellido"
          autoComplete="off"
          className={`${FIELD} ${removed ? 'line-through opacity-60' : ''}`}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-wide text-faint sm:sr-only">
          Universidad
        </span>
        <select
          name={`universidad-${rowKey}`}
          defaultValue={universityId ?? ''}
          className={`${FIELD} ${removed ? 'opacity-60' : ''}`}
        >
          <option value="">sin universidad</option>
          {universities.map((university) => (
            <option key={university.id} value={university.id}>
              {university.tag}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-wide text-faint sm:sr-only">
          Riot ID de la planilla
        </span>
        <input
          name={`riot-${rowKey}`}
          defaultValue={riot}
          placeholder="Nombre#TAG"
          spellCheck={false}
          autoComplete="off"
          className={`${FIELD} ${removed ? 'opacity-60' : ''}`}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-wide text-faint sm:sr-only">
          Nick del plantel
        </span>
        <select
          name={`player-${rowKey}`}
          defaultValue={playerId ?? ''}
          className={`${FIELD} ${removed ? 'opacity-60' : ''}`}
        >
          <option value="">
            {accounts.length === 0 ? 'no hay nicks cargados' : 'sin emparejar'}
          </option>
          {accounts.map((account) => (
            <option key={account.player_id} value={account.player_id}>
              {riotId(account.riot_game_name, account.riot_tag_line)}
              {account.linked && account.player_id !== playerId ? ' (ya asignada)' : ''}
            </option>
          ))}
        </select>
        {note && <span className="text-[11px] text-faint">{note}</span>}
      </label>

      <div className="flex items-start sm:pt-[26px]">
        <button
          type="button"
          onClick={onToggle}
          className={`w-14 border-2 px-2 py-1 text-xs transition-colors ${
            removed
              ? 'border-danger/60 text-danger hover:border-danger'
              : 'border-line-strong text-muted hover:border-danger hover:text-danger'
          }`}
        >
          {removed ? 'Volver' : 'Quitar'}
        </button>
      </div>
    </li>
  )
}
