'use client'

import { useActionState, useState } from 'react'
import { setQuarterFinalsAction, type DrawResult } from '@/app/(app)/admin/actions'
import { sharedUniversity, type Pairing, type Qualified } from '@/lib/lide2/draw'

/**
 * The quarter-final draw, entered by hand.
 *
 * Rule 2.3 crosses group winners with runners-up through a draw, so the site
 * cannot work the pairings out: until they are entered the bracket says "A
 * sortear". Nothing here guesses.
 *
 * Each row is one quarter-final, with the winners on the left and the
 * runners-up on the right. The selects only offer the side's teams, which is
 * the one part of the rule the draw does not touch; everything else is checked
 * on the server by `drawProblems`, because a form can be bypassed.
 *
 * A pairing of two teams from the same university is flagged as it is picked
 * rather than refused: the rulebook only asks the draw to avoid it "sujeto a
 * disponibilidad", and the organizers are the ones who know whether it could
 * have been avoided.
 */
export function DrawQuarters({
  quarters,
  qualified,
  current,
}: {
  /** The bracket's quarter-finals, in order, by `order_index`. */
  quarters: number[]
  qualified: Qualified[]
  /** What the bracket already holds, so the form opens on it. */
  current: Record<number, Pairing>
}) {
  const [state, formAction, pending] = useActionState<DrawResult | null, FormData>(
    setQuarterFinalsAction,
    null,
  )

  const [picked, setPicked] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      quarters.flatMap((order) => [
        [`a-${order}`, current[order]?.teamAId ?? ''],
        [`b-${order}`, current[order]?.teamBId ?? ''],
      ]),
    ),
  )

  const byId = new Map(qualified.map((team) => [team.teamId, team]))
  const winners = qualified.filter((team) => team.position === 1)
  const runnersUp = qualified.filter((team) => team.position === 2)

  /** Teams already used in another row, so the same one is not picked twice. */
  const takenBy = (field: string) =>
    new Set(
      Object.entries(picked)
        .filter(([key, value]) => key !== field && value !== '')
        .map(([, value]) => value),
    )

  const select = (field: string, options: Qualified[]) => {
    const taken = takenBy(field)

    return (
      <select
        id={field}
        name={field}
        value={picked[field] ?? ''}
        onChange={(event) => setPicked((prev) => ({ ...prev, [field]: event.target.value }))}
        className="min-w-0 flex-1 border-2 border-line-strong bg-raised px-3 py-1.5 text-sm focus:border-accent"
      >
        <option value="">Sin definir</option>
        {options.map((team) => (
          <option key={team.teamId} value={team.teamId} disabled={taken.has(team.teamId)}>
            {team.position}º {team.group} · {team.teamName}
            {team.universities.length > 0 && ` (${team.universities.join('/')})`}
          </option>
        ))}
      </select>
    )
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {quarters.map((order) => {
          const clash = sharedUniversity(byId.get(picked[`a-${order}`]), byId.get(picked[`b-${order}`]))

          return (
            <li key={order} className="flex flex-col gap-1 border-2 border-line bg-surface px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-faint">
                Cruce {order}
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor={`a-${order}`}>
                  Primero del cruce {order}
                </label>
                {select(`a-${order}`, winners)}

                <span className="text-xs text-dim">vs</span>

                <label className="sr-only" htmlFor={`b-${order}`}>
                  Segundo del cruce {order}
                </label>
                {select(`b-${order}`, runnersUp)}
              </div>

              {clash && (
                <p className="text-xs text-danger">
                  Los dos son de {clash}: el sorteo trata de evitarlo, pero se puede guardar igual.
                </p>
              )}
            </li>
          )
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-accent-strong px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent disabled:opacity-60"
        >
          {pending ? 'Guardando…' : 'Guardar los cruces'}
        </button>

        {state?.ok && <p className="text-sm text-ok">Cruces guardados. Ya están en el bracket.</p>}
      </div>

      {state?.problems && state.problems.length > 0 && (
        <ul className="flex flex-col gap-1 rounded border border-danger/40 bg-danger-dim px-4 py-3 text-sm text-danger">
          {state.problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}
    </form>
  )
}
