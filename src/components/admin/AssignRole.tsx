'use client'

import { useActionState } from 'react'
import { assignRoleAction } from '@/app/(app)/equipos/actions'
import { formatPosition, ROLES } from '@/lib/format'
import type { AssignRoleResult } from '@/lib/teams/service'

/**
 * Which lane this account plays, by hand.
 *
 * `team_lineup` takes the lane from the match history, and before anything is
 * played it has nowhere to get it from: the slot reads "Sin posición" even when
 * whoever entered the nick already knows they play support because they were
 * told so at signup. This dropdown is that information, next to every nick on
 * the roster.
 *
 * It is a provisional, and since 0023 it says so: the first replay overrides
 * it, because a lane somebody was told at signup can be out of date by Sunday
 * and a scoreboard cannot. The dropdown stays on every row that has an account
 * anyway - it is what fills the lineup for the accounts that have not played
 * yet, and it keeps showing what was entered so a wrong one can be cleared.
 */
export function AssignRole({
  teamId,
  playerId,
  role,
}: {
  teamId: string
  playerId: string
  /** The hand assignment exactly as stored, not the slot's effective lane. */
  role: string | null
}) {
  const [state, formAction, pending] = useActionState<AssignRoleResult | null, FormData>(
    assignRoleAction,
    null,
  )

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="playerId" value={playerId} />

      {/* The `key` is what is stored today: without it, after saving, the
          dropdown would spend an instant showing the previous assignment until
          the next render (see the same trick in AssignAccount). */}
      <select
        key={role ?? 'sin'}
        name="role"
        defaultValue={role ?? ''}
        aria-label="Línea de esta cuenta"
        disabled={pending}
        className="rounded border border-line-strong bg-raised px-2 py-1 text-xs focus:border-accent disabled:opacity-50"
      >
        <option value="">sin asignar</option>
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {formatPosition(r)}
          </option>
        ))}
      </select>

      <button
        type="submit"
        disabled={pending}
        className="rounded border border-line-strong px-2 py-1 text-xs text-muted transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? '…' : 'Guardar'}
      </button>

      {state?.error && (
        <p role="alert" className="text-xs text-danger">
          {state.error}
        </p>
      )}
    </form>
  )
}
