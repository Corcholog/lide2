'use client'

import { useActionState } from 'react'
import {
  setSeriesWalkoverAction,
  type SeriesWalkoverResult,
} from '@/app/(app)/admin/actions'

/**
 * Gives a series to the team that turned up.
 *
 * A no-show in the playoffs would otherwise leave the bracket stuck: there are
 * no games to upload, so nothing advances the round. An awarded series has no
 * games on purpose — the winner goes through and the card says W.O. instead of
 * a score nobody played.
 *
 * A dropdown plus a button rather than one click per team, as in `Ruling`:
 * handing a playoff round to the wrong side by a misclick is not a mistake
 * worth risking. The empty option takes the award back.
 */
export function SeriesWalkover({
  seriesId,
  teamA,
  teamB,
  current,
  hasGames,
}: {
  seriesId: string
  teamA: { id: string; name: string }
  teamB: { id: string; name: string }
  /** The team it is already awarded to, if any. */
  current: string | null
  /** With games filed, the series was played and cannot be awarded. */
  hasGames: boolean
}) {
  const [state, formAction, pending] = useActionState<SeriesWalkoverResult | null, FormData>(
    setSeriesWalkoverAction,
    null,
  )

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="seriesId" value={seriesId} />

      <label className="sr-only" htmlFor={`wo-${seriesId}`}>
        No presentación
      </label>
      <select
        id={`wo-${seriesId}`}
        name="teamId"
        defaultValue={current ?? ''}
        disabled={hasGames}
        className="border-2 border-line-strong bg-raised px-3 py-1.5 text-sm focus:border-accent disabled:opacity-50"
      >
        <option value="">Se juega</option>
        {[teamA, teamB].map((team) => (
          <option key={team.id} value={team.id}>
            Gana {team.name} por no presentación
          </option>
        ))}
      </select>

      <button
        type="submit"
        disabled={pending || hasGames}
        className="rounded border border-line-strong px-3 py-1.5 text-sm transition-colors hover:border-accent disabled:opacity-50"
      >
        {pending ? 'Guardando…' : 'Guardar'}
      </button>

      {hasGames && (
        <span className="text-xs text-dim">
          Ya tiene partidas cargadas: sacalas si no se jugó.
        </span>
      )}
      {state?.error && <span className="text-xs text-danger">{state.error}</span>}
      {state?.ok && <span className="text-xs text-ok">Guardado.</span>}
    </form>
  )
}
