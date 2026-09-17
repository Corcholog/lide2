'use client'

import { useActionState } from 'react'
import { setRulingAction, type RulingResult } from '@/app/(app)/admin/actions'
import { RULINGS } from '@/lib/lide2/rulings'

/**
 * Overturns a played result by ruling (ineligible lineup).
 *
 * Unlike `Walkover`, the match was played: setting a ruling annuls it for all
 * statistics and gives the matchup to the other team, while the replay and
 * scoreboard stay, marked. See `supabase/migrations/0031_alineacion_indebida.sql`.
 * A dropdown plus confirm avoids awarding the wrong team with one misclick; the
 * empty option restores the played result.
 */
export function Ruling({
  fixtureId,
  teamA,
  teamB,
  current,
}: {
  fixtureId: string
  teamA: { id: string; name: string }
  teamB: { id: string; name: string }
  /** The team the current ruling favours, if any. */
  current: string | null
}) {
  const [state, formAction, pending] = useActionState<RulingResult | null, FormData>(
    setRulingAction,
    null,
  )

  const reason = RULINGS.alineacion_indebida.long.toLowerCase()

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="fixtureId" value={fixtureId} />
      <input type="hidden" name="ruling" value="alineacion_indebida" />

      <label className="sr-only" htmlFor={`fallo-${fixtureId}`}>
        Resultado por reglamento
      </label>
      <select
        id={`fallo-${fixtureId}`}
        name="winnerTeamId"
        defaultValue={current ?? ''}
        className="border border-line-strong bg-surface px-2 py-1 text-xs text-fg"
      >
        <option value="">Vale lo jugado</option>
        <option value={teamA.id}>
          Gana {teamA.name} ({reason})
        </option>
        <option value={teamB.id}>
          Gana {teamB.name} ({reason})
        </option>
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
          {state.winner} gana por reglamento. La partida de {state.sanctioned} queda anulada.
        </p>
      )}
      {state?.ok && state.cleared && (
        <p className="text-xs text-muted">Vuelve a valer el resultado jugado.</p>
      )}
    </form>
  )
}
