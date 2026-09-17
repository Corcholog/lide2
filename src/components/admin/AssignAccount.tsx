'use client'

import { useActionState } from 'react'
import { assignAccountAction } from '@/app/(app)/equipos/actions'
import { riotId } from '@/lib/format'
import type { AssignAccountResult } from '@/lib/teams/service'
import type { TeamAccountRow } from '@/types/db'

/**
 * Links a signup to one of the team's accounts, next to the signup.
 *
 * `link_roster_accounts()` only links automatically when the declared Riot ID
 * matches exactly; this covers the rest (no Riot ID, an old nick, a typo). One
 * dropdown per signup; /admin/planteles saves whole rosters instead.
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
        Keyed by the stored account: React resets the form's fields after the
        action, and without the key the dropdown would briefly show the previous
        account.
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
