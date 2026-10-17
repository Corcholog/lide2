'use client'

import { useActionState } from 'react'
import { setGameResultAction, type GameResultResult } from '@/app/(app)/admin/actions'

/**
 * One game of a playoff series: who won it while it is being played.
 *
 * The replay is not there yet, so this is the only way the site learns of the
 * result. The dropdown plus a button, as in `SeriesWalkover`, so a misclick
 * cannot hand a game to the wrong side; the empty option takes it back. A game
 * with its replay filed is read-only: the replay is the result.
 */
export function LiveResult({
  seriesId,
  game,
  teamA,
  teamB,
  current,
  hasReplay,
}: {
  seriesId: string
  game: number
  teamA: { id: string; name: string }
  teamB: { id: string; name: string }
  /** The team the result already names, if any. */
  current: string | null
  hasReplay: boolean
}) {
  const [state, formAction, pending] = useActionState<GameResultResult | null, FormData>(
    setGameResultAction,
    null,
  )

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="seriesId" value={seriesId} />
      <input type="hidden" name="gameNumber" value={game} />

      <span className="w-20 text-sm font-semibold">Partida {game}</span>

      <label className="sr-only" htmlFor={`res-${seriesId}-${game}`}>
        Ganador de la partida {game}
      </label>
      <select
        id={`res-${seriesId}-${game}`}
        name="winnerTeamId"
        defaultValue={current ?? ''}
        disabled={hasReplay}
        className="border-2 border-line-strong bg-raised px-3 py-1.5 text-sm focus:border-accent disabled:opacity-50"
      >
        <option value="">Sin jugar</option>
        {[teamA, teamB].map((team) => (
          <option key={team.id} value={team.id}>
            Gana {team.name}
          </option>
        ))}
      </select>

      <button
        type="submit"
        disabled={pending || hasReplay}
        className="rounded border border-line-strong px-3 py-1.5 text-sm transition-colors hover:border-accent disabled:opacity-50"
      >
        {pending ? 'Guardando…' : 'Guardar'}
      </button>

      {hasReplay && <span className="text-xs text-dim">Replay cargado</span>}
      {!hasReplay && current && !state && <span className="text-xs text-dim">Falta el replay</span>}
      {state?.error && <span className="text-xs text-danger">{state.error}</span>}
      {state?.ok && <span className="text-xs text-ok">{state.cleared ? 'Borrado.' : 'Guardado.'}</span>}
    </form>
  )
}
