import { formatNumber } from '@/lib/format'

/**
 * El daño de un jugador, en relación al que más hizo en esa partida.
 *
 * El número solo no dice nada: 25.000 es muchísimo para un soporte y poco para
 * un ADC. La barra es lo que se lee de un vistazo, y por eso la escala es
 * siempre el máximo de la misma partida y no un tope fijo.
 *
 * Vive acá porque la usan el scoreboard de la ficha y el detalle desplegable
 * del listado: si cada uno la dibujara a su manera, la misma partida se vería
 * distinta en dos páginas.
 */

/* Tailwind lee el fuente: los dos tonos van enteros y no armados en runtime. */
const RELLENO = {
  100: 'bg-side-blue-fill',
  200: 'bg-side-red-fill',
} as const

export function BarraDeDano({
  damage,
  max,
  side,
  ancho = 'w-20',
}: {
  damage: number
  /** El daño más alto de la partida. */
  max: number
  side: 100 | 200
  /** Clase de ancho, literal: `w-14`. Ver la nota de arriba. */
  ancho?: string
}) {
  return (
    <div className="flex items-center gap-2">
      <div className={`h-1.5 overflow-hidden rounded-full bg-raised ${ancho}`}>
        <div
          className={`h-full rounded-r-[4px] ${RELLENO[side]}`}
          style={{ width: `${max > 0 ? (damage / max) * 100 : 0}%` }}
        />
      </div>
      <span className="tabular text-xs text-muted">{formatNumber(damage)}</span>
    </div>
  )
}
