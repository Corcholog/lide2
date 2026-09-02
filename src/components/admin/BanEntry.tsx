'use client'

import { useActionState } from 'react'
import { saveBansAction } from '@/app/(app)/admin/actions'
import type { SaveBansResult } from '@/lib/bans/service'

/**
 * A match's ten bans.
 *
 * The .rofl stores the final scoreboard, not the draft, so this is the only
 * thing that can fill `match_bans`. Without it the champion table shows pick
 * rate and win rate but the ban rate and presence columns stay blank.
 *
 * THEY ARE TEXT FIELDS WITH A `<datalist>` AND NOT DROPDOWNS. There are 170
 * champions: a `<select>` per slot would be 1700 nodes per match, and picking
 * from a list of 170 with the mouse is slower than typing three letters. The
 * datalist is a single one for all ten fields - the page draws it, not this
 * component - it filters as you type and it works on a phone.
 *
 * The price is that anything at all can be typed, and the server action catches
 * that: it does not resolve the name, it saves nothing and it says which one it
 * was.
 */

/* Tailwind cannot see a class built at runtime: both tones go in whole. */
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
                  /* The `key` is what is stored: without it, after saving, the
                     field spends an instant holding the old value (same trick
                     as AssignRole). */
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
