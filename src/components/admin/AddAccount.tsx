'use client'

import { useActionState } from 'react'
import { addAccountAction, type AccountResult } from '@/app/(app)/equipos/actions'

/**
 * Cargar un nick a mano en el plantel de un equipo.
 *
 * La otra forma de sumar a alguien —la lista de abajo— son las cuentas que ya
 * jugaron y todavía no tienen equipo. Antes de la fecha 1 esa lista está vacía
 * para todos los equipos, porque `players` se llena desde los replays: no hay
 * forma de completar un plantel hasta que se juegue algo. Escribiendo el nick
 * la cuenta se crea igual, sin PUUID, y se engancha sola con su primer replay
 * (ver `adopt_manual_accounts()` en 0017_alta_de_cuenta.sql).
 */
export function AddAccount({ teamId }: { teamId: string }) {
  const [state, formAction, pending] = useActionState<AccountResult | null, FormData>(
    addAccountAction,
    null,
  )

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="teamId" value={teamId} />

      {/*
        React vacía los campos de un `<form action>` cuando la acción termina,
        haya salido bien o mal, y los deja en su `defaultValue`. De ahí que el
        campo vuelva vacío cuando la cuenta quedó cargada y con lo que se
        escribió cuando no: si el error es "escribilo con #TAG", lo que hace
        falta es corregir esas cuatro letras y no volver a tipear todo.
      */}
      <input
        name="riot"
        defaultValue={state?.ok ? '' : (state?.nick ?? '')}
        placeholder="Nick#TAG"
        aria-label="Nick de la cuenta"
        spellCheck={false}
        autoComplete="off"
        className="w-full rounded border border-line-strong bg-raised px-3 py-1.5 text-sm outline-none focus:border-accent sm:w-56"
      />

      <button
        type="submit"
        disabled={pending}
        className="rounded border border-line-strong px-3 py-1.5 text-sm text-muted transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? 'Agregando…' : 'Agregar nick'}
      </button>

      {state?.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      {state?.ok && <p className="text-sm text-ok">{resumen(state)}</p>}
    </form>
  )
}

/** Qué pasó: si la cuenta ya existía, importa que traiga partidas encima. */
function resumen(state: AccountResult): string {
  const nick = state.nick ?? 'La cuenta'
  if (state.created) return `${nick} al plantel. Se engancha sola cuando juegue.`

  const games = state.games ?? 0
  return `${nick} al plantel · ya tenía ${games} ${games === 1 ? 'partida' : 'partidas'}`
}
