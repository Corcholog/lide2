'use client'

import { useActionState } from 'react'
import { assignRoleAction } from '@/app/(app)/equipos/actions'
import { formatPosition, ROLES } from '@/lib/format'
import type { AssignRoleResult } from '@/lib/teams/service'

/**
 * Sets an account's lane by hand, next to each nick on the roster.
 *
 * Useful before any match is played, when `team_lineup` has no history to
 * derive lanes from. Since 0023 the first replay overrides it. It keeps showing
 * the stored value so a wrong assignment can be cleared.
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

      {/* Keyed by the stored value, so the dropdown does not briefly show the
          previous assignment after saving (as in AssignAccount). */}
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
