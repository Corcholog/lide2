'use client'

import { useActionState } from 'react'
import { mergeAccountAction } from '@/app/(app)/equipos/actions'
import type { MergeAccountResult } from '@/lib/teams/service'

/**
 * The click that says "this is the same person, they changed their nick".
 *
 * The panel works out the pairing and shows it; this only confirms it. It is
 * never done automatically because the evidence has a second reading that looks
 * identical: a nick that stopped appearing and a nick that started appearing is
 * either one person who renamed, or a starter who was benched for a substitute.
 * Only somebody who knows the team can tell, and getting it wrong hands that
 * person's matches to another university where nobody will spot it.
 *
 * Absorbing is not reversible - the typed-in row disappears, and with it the
 * only record of what the sheet said - so the button spells out what it will do
 * rather than saying "confirm".
 */
export function MergeAccount({
  teamId,
  placeholderId,
  realId,
  realName,
}: {
  teamId: string
  placeholderId: string
  /** The account that played: the one that stays. */
  realId: string
  realName: string
}) {
  const [state, formAction, pending] = useActionState<MergeAccountResult | null, FormData>(
    mergeAccountAction,
    null,
  )

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="placeholderId" value={placeholderId} />
      <input type="hidden" name="realId" value={realId} />

      <button
        type="submit"
        disabled={pending}
        className="rounded border border-line-strong px-2 py-1 text-xs text-muted transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? '…' : `Es ${realName}`}
      </button>

      {state?.error && (
        <p role="alert" className="text-xs text-danger">
          {state.error}
        </p>
      )}
    </form>
  )
}
