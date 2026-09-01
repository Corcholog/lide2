'use client'

import { useActionState, useId, useState } from 'react'
import { saveTeamRosterAction, type RosterActionResult } from '@/app/(app)/admin/roster-actions'
import { riotId } from '@/lib/format'
import type { RosterStatusRow, TeamAccountRow } from '@/types/db'

/**
 * El plantel de un equipo: quiénes están anotados y qué cuenta es cada uno.
 *
 * Un solo formulario y un solo botón para las cinco o siete filas. Guardar de a
 * uno son cinco viajes al servidor y cinco recargas de la página para completar
 * un plantel, y además el alta y la baja tienen que viajar juntas: el servidor
 * compara el formulario entero contra el plantel de la base y rechaza el
 * conjunto si no coincide (ver `planRosterEdit`).
 *
 * Las bajas y las altas no se aplican hasta guardar. "Quitar" tacha la fila y
 * la manda marcada; "Agregar" dibuja una fila que todavía no existe en la base.
 * Así una baja mal tildada se deshace con otro clic y no con un undo.
 *
 * Cada inscripto tiene dos formas de quedar emparejado, y conviven a propósito:
 * el Riot ID escrito (que sirve aunque esa persona todavía no haya jugado nunca,
 * y se resuelve solo cuando aparezca) y el desplegable de cuentas (que sirve
 * cuando el Riot ID declarado no coincide con el que usó de verdad).
 */

export interface UniversityOption {
  id: string
  tag: string
  name: string
}

const CAMPO =
  'border-2 border-line-strong bg-raised px-2 py-1.5 text-sm focus:border-accent'

/** Las cinco columnas de una fila, iguales en el encabezado y en cada inscripto. */
const COLUMNAS =
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
        La `key` son los inscriptos que hay hoy, así que un alta o una baja
        guardada remonta la lista y se lleva puestas las marcas de la tanda
        anterior: las filas nuevas ya existen en la base y volvieron por `rows`,
        y volver a mandarlas las guardaría dos veces. Un guardado que falla no
        cambia la key y deja todo como estaba, que es lo que hace falta para
        corregir y reintentar.
      */}
      <Filas
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
        {state?.ok && <p className="text-sm text-ok">{resumen(state)}</p>}
      </footer>
    </form>
  )
}

/** Qué pasó al guardar, sin enumerar los ceros. */
function resumen(state: RosterActionResult): string {
  const partes = [
    state.added ? `${state.added} de alta` : null,
    state.removed ? `${state.removed} de baja` : null,
    state.linked ? `${state.linked} emparejados` : null,
  ].filter(Boolean)

  return partes.length > 0 ? `Guardado · ${partes.join(' · ')}` : 'Guardado'
}

/**
 * Qué decir debajo del desplegable. Una cuenta emparejada con 0 partidas no es
 * un error: es un nick cargado a mano que todavía no jugó (ver 0017).
 */
function nota(row: RosterStatusRow): string | null {
  if (!row.player_id) return null
  return row.games > 0 ? `${row.games} partidas` : 'todavía no jugó'
}

/** Las filas del plantel, con lo que se agregó y lo que se quitó todavía sin guardar. */
function Filas({
  rows,
  accounts,
  universities,
}: {
  rows: RosterStatusRow[]
  accounts: TeamAccountRow[]
  universities: UniversityOption[]
}) {
  const prefijo = useId()
  const [nuevos, setNuevos] = useState<string[]>([])
  const [bajas, setBajas] = useState<string[]>([])

  const dadosDeBaja = new Set(bajas)

  return (
    <>
      {/* Los rótulos van una vez arriba de todo y no en cada fila. En pantalla
          angosta la fila se apila y no corresponderían a nada, así que se
          esconden y manda el `sr-only` que lleva cada campo. */}
      <div
        className={`hidden gap-2 border-b-2 border-line px-4 py-2 text-[11px] uppercase tracking-wide text-faint sm:grid ${COLUMNAS}`}
      >
        <span>Nombre</span>
        <span>Universidad</span>
        <span>Riot ID de la planilla</span>
        <span>Nick del plantel</span>
        <span className="w-14" />
      </div>

      <ul className="divide-y divide-line">
        {rows.map((row) => (
          <Fila
            key={row.roster_id}
            clave={row.roster_id}
            nombre={row.display_name ?? row.full_name}
            universityId={row.university_id}
            riot={
              row.declared_game_name ? riotId(row.declared_game_name, row.declared_tag_line) : ''
            }
            playerId={row.player_id}
            nota={nota(row)}
            accounts={accounts}
            universities={universities}
            baja={dadosDeBaja.has(row.roster_id)}
            onToggle={() =>
              setBajas((previas) =>
                previas.includes(row.roster_id)
                  ? previas.filter((id) => id !== row.roster_id)
                  : [...previas, row.roster_id],
              )
            }
          />
        ))}

        {nuevos.map((clave) => (
          <Fila
            key={clave}
            clave={clave}
            nuevo
            nombre=""
            universityId={null}
            riot=""
            playerId={null}
            nota="alta sin guardar"
            accounts={accounts}
            universities={universities}
            baja={false}
            onToggle={() => setNuevos((previos) => previos.filter((id) => id !== clave))}
          />
        ))}

        {rows.length === 0 && nuevos.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-faint">
            Este equipo no tiene inscriptos cargados.
          </li>
        )}
      </ul>

      <div className="border-t-2 border-dashed border-line px-4 py-2">
        <button
          type="button"
          onClick={() => setNuevos((previos) => [...previos, `nuevo-${prefijo}-${previos.length}`])}
          className="text-xs uppercase tracking-wide text-muted transition-colors hover:text-accent"
        >
          + Agregar inscripto
        </button>
      </div>
    </>
  )
}

function Fila({
  clave,
  nuevo,
  nombre,
  universityId,
  riot,
  playerId,
  nota,
  accounts,
  universities,
  baja,
  onToggle,
}: {
  clave: string
  nuevo?: boolean
  nombre: string
  universityId: string | null
  riot: string
  playerId: string | null
  nota: string | null
  accounts: TeamAccountRow[]
  universities: UniversityOption[]
  baja: boolean
  onToggle: () => void
}) {
  return (
    <li className={`grid gap-2 px-4 py-3 ${COLUMNAS} ${baja ? 'bg-danger-dim' : ''}`}>
      {/* Este oculto es el que define qué filas manda el formulario: los campos
          de una fila pueden llegar vacíos, pero éste viaja siempre. */}
      <input type="hidden" name={`fila-${clave}`} value={nuevo ? 'nuevo' : 'existente'} />
      {baja && <input type="hidden" name={`baja-${clave}`} value="1" />}

      <label className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-wide text-faint sm:sr-only">Nombre</span>
        <input
          name={`nombre-${clave}`}
          defaultValue={nombre}
          placeholder="Nombre y apellido"
          autoComplete="off"
          className={`${CAMPO} ${baja ? 'line-through opacity-60' : ''}`}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-wide text-faint sm:sr-only">
          Universidad
        </span>
        <select
          name={`universidad-${clave}`}
          defaultValue={universityId ?? ''}
          className={`${CAMPO} ${baja ? 'opacity-60' : ''}`}
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
          name={`riot-${clave}`}
          defaultValue={riot}
          placeholder="Nombre#TAG"
          spellCheck={false}
          autoComplete="off"
          className={`${CAMPO} ${baja ? 'opacity-60' : ''}`}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-wide text-faint sm:sr-only">
          Nick del plantel
        </span>
        <select
          name={`player-${clave}`}
          defaultValue={playerId ?? ''}
          className={`${CAMPO} ${baja ? 'opacity-60' : ''}`}
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
        {nota && <span className="text-[11px] text-faint">{nota}</span>}
      </label>

      <div className="flex items-start sm:pt-[26px]">
        <button
          type="button"
          onClick={onToggle}
          className={`w-14 border-2 px-2 py-1 text-xs transition-colors ${
            baja
              ? 'border-danger/60 text-danger hover:border-danger'
              : 'border-line-strong text-muted hover:border-danger hover:text-danger'
          }`}
        >
          {baja ? 'Volver' : 'Quitar'}
        </button>
      </div>
    </li>
  )
}
