'use client'

import { useActionState } from 'react'
import { saveTeamRosterAction, type RosterActionResult } from '@/app/(app)/admin/roster-actions'
import { riotId } from '@/lib/format'
import type { RosterStatusRow, TeamAccountRow } from '@/types/db'

/**
 * El plantel de un equipo, con su emparejado.
 *
 * Un solo botón para las cinco o siete filas: completar un plantel guardando de
 * a uno son cinco viajes al servidor y cinco recargas de la página.
 *
 * Cada inscripto tiene dos formas de quedar emparejado, y conviven a propósito:
 * el Riot ID escrito (que sirve aunque esa persona todavía no haya jugado nunca,
 * y se resuelve solo cuando aparezca) y el desplegable de cuentas (que sirve
 * cuando el Riot ID declarado no coincide con el que usó de verdad).
 */
export function RosterTeam({
  team,
  rows,
  accounts,
}: {
  team: { id: string; name: string; groupLabel: string | null }
  rows: RosterStatusRow[]
  accounts: TeamAccountRow[]
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
          <span className={linked === rows.length ? 'text-ok' : ''}>
            {linked}/{rows.length} emparejados
          </span>
          {declared > linked && ` · ${declared - linked} esperando que jueguen`}
        </p>
      </header>

      <ul className="divide-y divide-line">
        {rows.map((row) => (
          <li key={row.roster_id} className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_1fr_1fr]">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{row.display_name ?? row.full_name}</p>
              <p className="text-xs text-faint">
                {row.university_tag ?? '—'}
                {row.player_id && row.games > 0 && ` · ${row.games} partidas`}
              </p>
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wide text-faint sm:sr-only">
                Riot ID de la planilla
              </span>
              <input
                name={`riot-${row.roster_id}`}
                defaultValue={
                  row.declared_game_name
                    ? riotId(row.declared_game_name, row.declared_tag_line)
                    : ''
                }
                placeholder="Nombre#TAG"
                spellCheck={false}
                autoComplete="off"
                className="border-2 border-line-strong bg-raised px-2 py-1.5 text-sm outline-none focus:border-accent"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wide text-faint sm:sr-only">
                Cuenta que jugó
              </span>
              <select
                name={`player-${row.roster_id}`}
                defaultValue={row.player_id ?? ''}
                className="border-2 border-line-strong bg-raised px-2 py-1.5 text-sm outline-none focus:border-accent"
              >
                <option value="">
                  {accounts.length === 0 ? 'todavía no jugó nadie' : 'sin emparejar'}
                </option>
                {accounts.map((account) => (
                  <option key={account.player_id} value={account.player_id}>
                    {riotId(account.riot_game_name, account.riot_tag_line)}
                    {account.linked && account.player_id !== row.player_id ? ' (ya asignada)' : ''}
                  </option>
                ))}
              </select>
            </label>
          </li>
        ))}
      </ul>

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
        {state?.ok && (
          <p className="text-sm text-ok">
            Guardado{state.linked ? ` · ${state.linked} emparejados` : ''}
          </p>
        )}
      </footer>
    </form>
  )
}
