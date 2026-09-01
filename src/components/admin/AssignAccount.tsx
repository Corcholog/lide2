'use client'

import { useActionState } from 'react'
import { assignAccountAction } from '@/app/(app)/equipos/actions'
import { riotId } from '@/lib/format'
import type { AssignAccountResult } from '@/lib/teams/service'
import type { TeamAccountRow } from '@/types/db'

/**
 * De quién es cada nick, al lado del inscripto.
 *
 * Las cuentas de un equipo entran por la ficha (`AddAccount`), así que es acá
 * donde quien las carga sabe de quién es cada una. El emparejado automático
 * —`link_roster_accounts()`— sólo lo resuelve cuando el Riot ID declarado en la
 * planilla coincide con el de la cuenta; cuando la planilla vino sin Riot ID,
 * con el nick viejo o mal escrito, no hay forma de que lo adivine y hasta ahora
 * había que ir a /admin/planteles a decirlo.
 *
 * Un desplegable por inscripto y no un formulario con todo el plantel: el de
 * /admin/planteles guarda las cinco filas juntas porque ahí se editan nombres,
 * universidades y bajas a la vez. Acá se toca una sola cosa, y de a una.
 */
export function AssignAccount({
  teamId,
  rosterId,
  playerId,
  accounts,
}: {
  teamId: string
  rosterId: string
  playerId: string | null
  accounts: TeamAccountRow[]
}) {
  const [state, formAction, pending] = useActionState<AssignAccountResult | null, FormData>(
    assignAccountAction,
    null,
  )

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="rosterId" value={rosterId} />

      {/*
        La `key` es la cuenta que tiene hoy en la base. React reinicia los
        campos de un `<form action>` cuando la acción termina y los deja en su
        `defaultValue`, que en un no controlado es el del primer render: sin
        esto el desplegable volvería a la cuenta anterior por un instante,
        justo después de guardar la nueva.
      */}
      <select
        key={playerId ?? 'sin'}
        name="playerId"
        defaultValue={playerId ?? ''}
        aria-label="Cuenta de este inscripto"
        disabled={pending}
        className="w-40 rounded border border-line-strong bg-raised px-2 py-1 text-xs focus:border-accent disabled:opacity-50"
      >
        <option value="">{accounts.length === 0 ? 'no hay nicks' : 'sin emparejar'}</option>
        {accounts.map((account) => (
          <option key={account.player_id} value={account.player_id}>
            {riotId(account.riot_game_name, account.riot_tag_line)}
            {account.linked && account.player_id !== playerId ? ' (ya asignada)' : ''}
          </option>
        ))}
      </select>

      <button
        type="submit"
        disabled={pending}
        className="rounded border border-line-strong px-2 py-1 text-xs text-muted transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? '…' : 'Asignar'}
      </button>

      {state?.error && (
        <p role="alert" className="text-xs text-danger">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p className="text-xs text-ok">{state.cleared ? 'sin cuenta' : `es ${state.nick}`}</p>
      )}
    </form>
  )
}
