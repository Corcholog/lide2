'use client'

import { useActionState } from 'react'
import { guardarBansAction } from '@/app/(app)/admin/actions'
import type { SaveBansResult } from '@/lib/bans/service'

/**
 * Los diez baneos de una partida.
 *
 * El .rofl guarda el scoreboard del final, no el draft, así que esto es lo
 * único que puede llenar `match_bans`. Sin eso, la tabla de campeones muestra
 * pick rate y winrate pero las columnas de ban rate y presencia quedan en
 * blanco.
 *
 * SON CAMPOS DE TEXTO CON `<datalist>` Y NO DESPLEGABLES. Son 170 campeones:
 * un `<select>` por casillero serían 1700 nodos por partida, y elegir de una
 * lista de 170 con el mouse es más lento que escribir tres letras. El datalist
 * es uno solo para los diez campos —lo dibuja la página, no este componente—,
 * filtra mientras se escribe y anda en teléfono.
 *
 * Lo que se paga es que se puede escribir cualquier cosa, y eso lo ataja la
 * server action: no resuelve el nombre, no guarda nada y dice cuál fue.
 */

/* Tailwind no ve una clase armada en runtime: los dos tonos van enteros. */
const TONO = {
  100: 'text-side-blue',
  200: 'text-side-red',
} as const

const ORDENES = [1, 2, 3, 4, 5] as const

export function CargarBans({
  matchId,
  bans,
  equipos,
}: {
  matchId: string
  /** Lo que ya está guardado, por `lado-orden`, con el nombre que se ve. */
  bans: Record<string, string>
  equipos: { 100: string; 200: string }
}) {
  const [state, formAction, pending] = useActionState<SaveBansResult | null, FormData>(
    guardarBansAction,
    null,
  )

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="matchId" value={matchId} />

      <div className="grid gap-4 sm:grid-cols-2">
        {([100, 200] as const).map((side) => (
          <fieldset key={side} className="flex flex-col gap-2">
            <legend className={`text-xs font-bold uppercase tracking-wide ${TONO[side]}`}>
              Banea {equipos[side]}
            </legend>

            {ORDENES.map((orden) => {
              const guardado = bans[`${side}-${orden}`] ?? ''

              return (
                <input
                  /* La `key` es lo que hay guardado: sin ella, después de
                     guardar el campo se queda un instante con el valor viejo
                     (mismo truco que AssignRole). */
                  key={`${orden}-${guardado}`}
                  type="text"
                  name={`ban-${side}-${orden}`}
                  list="campeones"
                  defaultValue={guardado}
                  disabled={pending}
                  autoComplete="off"
                  placeholder={`Ban ${orden}`}
                  aria-label={`Ban ${orden} de ${equipos[side]}`}
                  className="border-2 border-line-strong bg-raised px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-50"
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
