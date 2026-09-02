'use client'

import { useActionState } from 'react'
import { assignAccountAction } from '@/app/(app)/equipos/actions'
import { riotId } from '@/lib/format'
import type { AssignAccountResult } from '@/lib/teams/service'
import type { TeamAccountRow } from '@/types/db'

/**
 * Whose each nick is, right beside the signup.
 *
 * A team's accounts come in through its page (`AddAccount`), so this is where
 * whoever enters them knows whose each one is. The automatic matching -
 * `link_roster_accounts()` - only resolves it when the Riot ID declared on the
 * sheet equals the account's; when the sheet arrived with no Riot ID, with the
 * old nick or misspelled, there is no way for it to guess and until now you had
 * to go to /admin/planteles to say so.
 *
 * One dropdown per signup and not a form with the whole roster: the one on
 * /admin/planteles saves all five rows together because names, universities and
 * removals are edited there at once. Here one single thing is touched, one at a
 * time.
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
        The `key` is the account it holds in the database today. React resets
        the fields of a `<form action>` when the action finishes, leaving them
        at their `defaultValue`, which in an uncontrolled field is the one from
        the first render: without this the dropdown would flick back to the
        previous account for an instant, right after saving the new one.
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
