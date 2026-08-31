'use client'

import { useActionState } from 'react'
import { assignRoleAction } from '@/app/(app)/equipos/actions'
import { formatPosition, ROLES } from '@/lib/format'
import type { AssignRoleResult } from '@/lib/teams/service'

/**
 * En qué línea juega esta cuenta, a mano.
 *
 * `team_lineup` deduce la línea del historial de partidas, y antes de que se
 * juegue algo no tiene de dónde sacarla: el casillero queda "Sin posición" aun
 * cuando quien cargó el nick ya sabe que juega de soporte porque se lo dijeron
 * en la inscripción. Este desplegable es esa información, al lado de cada nick
 * del plantel.
 *
 * Va junto a cualquier fila con cuenta —titular o del banco—, porque lo
 * asignado a mano le gana a lo deducido: si alguien está de banco por las
 * partidas pero en realidad es el titular de una línea, se corrige acá mismo
 * y no yendo a buscar otra pantalla.
 */
export function AssignRole({
  teamId,
  playerId,
  role,
}: {
  teamId: string
  playerId: string
  /** La asignación a mano tal cual está guardada, no la línea efectiva del casillero. */
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

      {/* La `key` es lo que hay guardado hoy: sin ella, después de guardar el
          desplegable quedaría un instante mostrando la asignación anterior
          hasta el próximo render (ver el mismo truco en AssignAccount). */}
      <select
        key={role ?? 'sin'}
        name="role"
        defaultValue={role ?? ''}
        aria-label="Línea de esta cuenta"
        disabled={pending}
        className="rounded border border-line-strong bg-raised px-2 py-1 text-xs outline-none focus:border-accent disabled:opacity-50"
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
