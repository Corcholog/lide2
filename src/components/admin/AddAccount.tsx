'use client'

import { useActionState } from 'react'
import { addAccountAction, type AccountResult } from '@/app/(app)/equipos/actions'

/**
 * Adds a nick to a team's roster by hand. Before the first matchday no
 * accounts exist yet (they come from replays), so typing the nick creates one
 * without a PUUID, which links to its first replay (see
 * `adopt_manual_accounts()` in 0017_alta_de_cuenta.sql).
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
        React resets `<form action>` fields to their `defaultValue` after the
        action: empty after a successful save, and the typed text after an error,
        so it can be fixed instead of retyped.
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

/** The result message; for an existing account, how many games it brings. */
function summarize(state: AccountResult): string {
  const nick = state.nick ?? 'La cuenta'
  if (state.created) return `${nick} al plantel. Se engancha sola cuando juegue.`

  const games = state.games ?? 0
  return `${nick} al plantel · ya tenía ${games} ${games === 1 ? 'partida' : 'partidas'}`
}
