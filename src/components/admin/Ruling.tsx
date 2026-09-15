'use client'

import { useActionState } from 'react'
import { setRulingAction, type RulingResult } from '@/app/(app)/admin/actions'
import { RULINGS } from '@/lib/lide2/rulings'

/**
 * Overturning a played result by the rulebook.
 *
 * The sibling of `Walkover`, and deliberately not the same control. A walkover
 * is a matchup nobody played; this one WAS played, has its replay hooked up,
 * and the organizers decided it does not count - a team fielded a lineup that
 * was not its registered roster. Loading it annuls the whole match: the win
 * changes hands in the standings and nothing from that game counts for any
 * statistic. The replay and the scoreboard stay, marked. See
 * `supabase/migrations/0031_alineacion_indebida.sql`.
 *
 * A dropdown and a confirm, for the same reason as the walkover: two buttons
 * are one misclick away from handing a win to the wrong team. The empty option
 * is what undoes it, and it says what undoing means - the played result comes
 * back.
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
  /** Who the ruling already favours, when there is one. */
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
