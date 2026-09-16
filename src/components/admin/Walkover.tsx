'use client'

import { useActionState } from 'react'
import { setWalkoverAction, type WalkoverResult } from '@/app/(app)/admin/actions'

/**
 * Awards a matchup to the team that turned up (after the 15 minutes the rules
 * allow). There is no .rofl for it, so it cannot go through the upload flow.
 *
 * A dropdown plus confirm rather than two buttons, so a misclick cannot award
 * the wrong team. The empty option clears it.
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
  /** The team it is already awarded to, if any. */
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
