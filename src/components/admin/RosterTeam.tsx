'use client'

import { useActionState, useId, useState } from 'react'
import { saveTeamRosterAction, type RosterActionResult } from '@/app/(app)/admin/roster-actions'
import { riotId } from '@/lib/format'
import type { RosterStatusRow, TeamAccountRow } from '@/types/db'

/**
 * A team's roster editor: signups and their accounts, saved with one button.
 *
 * Additions and removals travel together because the server compares the whole
 * form with the stored roster (see `planRosterEdit`). Nothing applies until
 * save: "Quitar" strikes a row through and "Agregar" adds an unsaved row, so a
 * mistake is undone with another click.
 *
 * A signup can be matched two ways: a typed Riot ID (works before the person
 * plays and links once they do) or the accounts dropdown (for when the
 * declared Riot ID differs from the one used). Form field names are Spanish and
 * must match `readRosterForm`.
 */

export interface UniversityOption {
  id: string
  tag: string
  name: string
}

const FIELD =
  'border-2 border-line-strong bg-raised px-2 py-1.5 text-sm focus:border-accent'

/** The five column widths, shared by the header and every row. */
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
          <span className="text-faint">{rows.length} inscriptos · </span>
          <span className={linked === rows.length && rows.length > 0 ? 'text-ok' : ''}>
            {linked}/{rows.length} emparejados
          </span>
          {declared > linked && ` · ${declared - linked} esperando que jueguen`}
        </p>
      </header>

      {/*
        Keyed by the current signups, so a successful save remounts the list and
        clears pending marks (new rows now come back from the server). A failed
        save keeps the key and the form state, ready to fix and retry.
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

/** A summary of the save, skipping zero counts. */
function summarize(state: RosterActionResult): string {
  const parts = [
    state.added ? `${state.added} de alta` : null,
    state.removed ? `${state.removed} de baja` : null,
    state.linked ? `${state.linked} emparejados` : null,
  ].filter(Boolean)

  return parts.length > 0 ? `Guardado · ${parts.join(' · ')}` : 'Guardado'
}

/**
 * The note under the dropdown. A linked account with 0 games is not an error:
 * it is a nick entered by hand that has not played yet (see 0017).
 */
function noteFor(row: RosterStatusRow): string | null {
  if (!row.player_id) return null
  return row.games > 0 ? `${row.games} partidas` : 'todavía no jugó'
}

/** The roster rows, including unsaved additions and removals. */
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
      {/* Column labels once at the top; hidden on narrow screens, where rows
          stack and each field's `sr-only` label applies. */}
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
          + Agregar inscripto
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
      {/* This hidden field defines the row in the form; it is always sent even
          when the other fields are empty. */}
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
