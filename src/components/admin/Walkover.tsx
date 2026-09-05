'use client'

import { useActionState } from 'react'
import { setWalkoverAction, type WalkoverResult } from '@/app/(app)/admin/actions'

/**
 * Awarding a matchup to whoever turned up.
 *
 * The rules give 15 minutes of grace; past that the matchup is decided without
 * being played. It is the one result the rest of the panel cannot take, because
 * everything there starts from a .rofl that in this case does not exist.
 *
 * A dropdown and not two buttons. Two buttons - "gana A" / "gana B" - is one
 * click instead of two, and it is one click away from awarding the matchup to
 * the wrong team, which then shows up in the standings as a win nobody can
 * explain. Picking from a list and then confirming makes the choice visible
 * before it is made, and the empty option is what undoes it.
 */
export function Walkover({
  fixtureId,
  teamA,
  teamB,
  current,
}: {
  fixtureId: string
  teamA: { id: string; name: string }
  teamB: { id: string; name: string }
  /** Who it is already awarded to, when it is. */
  current: string | null
}) {
  const [state, formAction, pending] = useActionState<WalkoverResult | null, FormData>(
    setWalkoverAction,
    null,
  )

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="fixtureId" value={fixtureId} />

      <label className="sr-only" htmlFor={`wo-${fixtureId}`}>
        Equipo que se presentó
      </label>
      <select
        id={`wo-${fixtureId}`}
        name="winnerTeamId"
        defaultValue={current ?? ''}
        className="border border-line-strong bg-surface px-2 py-1 text-xs text-fg"
      >
        <option value="">Se juega</option>
        <option value={teamA.id}>Gana {teamA.name} (W.O.)</option>
        <option value={teamB.id}>Gana {teamB.name} (W.O.)</option>
      </select>

      <button
        type="submit"
        disabled={pending}
        className="border border-line-strong px-2 py-1 text-xs text-muted transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? '…' : 'Guardar'}
      </button>

      {state?.error && (
        <p role="alert" className="text-xs text-danger">
          {state.error}
        </p>
      )}
      {state?.ok && !state.cleared && (
        <p className="text-xs text-muted">
          {state.winner} gana: {state.absent} no se presentó.
        </p>
      )}
      {state?.ok && state.cleared && <p className="text-xs text-muted">Vuelve a jugarse.</p>}
    </form>
  )
}
