'use client'

import { useActionState } from 'react'
import { saveBansAction } from '@/app/(app)/admin/actions'
import type { SaveBansResult } from '@/lib/bans/service'

/**
 * The ten bans of a match; the only way to fill `match_bans`, since the .rofl
 * has no draft.
 *
 * Text fields with a shared `<datalist>` (rendered by the page) instead of
 * selects: 170 champions per select would be heavy, and typing a few letters is
 * faster. Anything can be typed, so the server action rejects unknown names and
 * saves nothing.
 */

/* Full class names: Tailwind cannot see classes built at runtime. */
const SIDE_TONE = {
  100: 'text-side-blue',
  200: 'text-side-red',
} as const

const BAN_SLOTS = [1, 2, 3, 4, 5] as const

export function BanEntry({
  matchId,
  bans,
  teamNames,
}: {
  matchId: string
  /** What is already stored, keyed by `side-slot`, holding the display name. */
  bans: Record<string, string>
  teamNames: { 100: string; 200: string }
}) {
  const [state, formAction, pending] = useActionState<SaveBansResult | null, FormData>(
    saveBansAction,
    null,
  )

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="matchId" value={matchId} />

      <div className="grid gap-4 sm:grid-cols-2">
        {([100, 200] as const).map((side) => (
          <fieldset key={side} className="flex flex-col gap-2">
            <legend className={`text-xs font-bold uppercase tracking-wide ${SIDE_TONE[side]}`}>
              Banea {teamNames[side]}
            </legend>

            {BAN_SLOTS.map((slot) => {
              const stored = bans[`${side}-${slot}`] ?? ''

              return (
                <input
                  /* Keyed by the stored value so the field does not briefly show
                     the old value after saving (as in AssignRole). */
                  key={`${slot}-${stored}`}
                  type="text"
                  name={`ban-${side}-${slot}`}
                  list="champions"
                  defaultValue={stored}
                  disabled={pending}
                  autoComplete="off"
                  placeholder={`Ban ${slot}`}
                  aria-label={`Ban ${slot} de ${teamNames[side]}`}
                  className="border-2 border-line-strong bg-raised px-3 py-2 text-sm focus:border-accent disabled:opacity-50"
                />
              )
            })}
          </fieldset>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="bg-accent-strong px-4 py-2 text-sm font-bold uppercase tracking-wide text-white transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:bg-line-strong"
        >
          {pending ? 'Guardando…' : 'Guardar draft'}
        </button>

        {state?.error && (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        )}

        {state?.ok && (
          <p className="text-sm text-ok">
            Draft guardado · {state.bans} {state.bans === 1 ? 'ban' : 'bans'}
          </p>
        )}

        <p className="text-xs text-faint">
          Un campo vacío es un ban que no se hizo: se guardan sólo los que estén escritos.
        </p>
      </div>
    </form>
  )
}
