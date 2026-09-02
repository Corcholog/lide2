'use client'

import { useActionState } from 'react'
import { addAccountAction, type AccountResult } from '@/app/(app)/equipos/actions'

/**
 * Adding a nick to a team's roster by hand.
 *
 * The other way of adding somebody - the list below - is the accounts that have
 * played and do not have a team yet. Before matchday 1 that list is empty for
 * every team, because `players` fills itself from the replays: there is no way
 * to complete a roster until something is played. Typing the nick creates the
 * account anyway, without a PUUID, and it hooks itself up with its first replay
 * (see `adopt_manual_accounts()` in 0017_alta_de_cuenta.sql).
 */
export function AddAccount({ teamId }: { teamId: string }) {
  const [state, formAction, pending] = useActionState<AccountResult | null, FormData>(
    addAccountAction,
    null,
  )

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="teamId" value={teamId} />

      {/*
        React clears the fields of a `<form action>` when the action finishes,
        whether it went well or not, leaving them at their `defaultValue`. Hence
        the field comes back empty when the account was saved and holding what
        was typed when it was not: if the error is "type it with #TAG", what is
        needed is fixing those four letters and not retyping everything.
      */}
      <input
        name="riot"
        defaultValue={state?.ok ? '' : (state?.nick ?? '')}
        placeholder="Nick#TAG"
        aria-label="Nick de la cuenta"
        spellCheck={false}
        autoComplete="off"
        className="w-full rounded border border-line-strong bg-raised px-3 py-1.5 text-sm focus:border-accent sm:w-56"
      />

      <button
        type="submit"
        disabled={pending}
        className="rounded border border-line-strong px-3 py-1.5 text-sm text-muted transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? 'Agregando…' : 'Agregar nick'}
      </button>

      {state?.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      {state?.ok && <p className="text-sm text-ok">{summarize(state)}</p>}
    </form>
  )
}

/** What happened: if the account already existed, the games it brings matter. */
function summarize(state: AccountResult): string {
  const nick = state.nick ?? 'La cuenta'
  if (state.created) return `${nick} al plantel. Se engancha sola cuando juegue.`

  const games = state.games ?? 0
  return `${nick} al plantel · ya tenía ${games} ${games === 1 ? 'partida' : 'partidas'}`
}
