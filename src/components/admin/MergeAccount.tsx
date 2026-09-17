'use client'

import { useActionState } from 'react'
import { mergeAccountAction } from '@/app/(app)/equipos/actions'
import type { MergeAccountResult } from '@/lib/teams/service'

/**
 * Confirms that two accounts are the same person after a nick change.
 *
 * The panel suggests the pairing; this confirms it. Never automatic: the same
 * evidence could mean a substitute played instead. Merging is irreversible, so
 * the button says exactly what it will do.
 */
export function MergeAccount({
  teamId,
  placeholderId,
  realId,
  realName,
}: {
  teamId: string
  placeholderId: string
  /** The account that played, which is kept. */
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
