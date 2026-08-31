/**
 * Convierte filas de la base en un ranking listo para mostrar.
 *
 * Todas las estadísticas hacen lo mismo —filtrar, ordenar, cortar el top y
 * formatear— así que eso vive acá una sola vez y cada estadística se reduce a
 * decir qué número mira y cómo se escribe.
 */

import type { StatBlock, StatRow, StatScope } from './types'
import { TOP_ROWS } from './types'

/**
 * Partidas mínimas para entrar en un ranking de promedios.
 *
 * Misma regla que `mvp_min_games()` en supabase/migrations/0010_stats.sql y por
 * el mismo motivo: en una fecha un equipo juega uno o dos partidos, así que
 * alcanza con haber jugado, pero en la fase entera son cuatro y el que apareció
 * una sola vez no puede encabezar un promedio. Los rankings de totales (kills,
 * daño) no lo necesitan: acumular ya premia al que jugó.
 *
 * El MVP lo decide la función de SQL, no ésta; acá se replica la regla para los
 * rankings que se arman en memoria.
 */
export function minGamesForAverages(scope: StatScope): number {
  return scope.matchday === null ? 3 : 1
}

export interface RankOptions<T> {
  /** El número por el que se ordena. */
  value: (row: T) => number
  /** Cómo se escribe ese número, con su unidad. */
  display: (value: number, row: T) => string
  id: (row: T) => string
  name: (row: T) => string
  subtitle?: (row: T) => string | null
  logo?: (row: T) => string | null
  /** A dónde lleva la fila. Sin esto no es un link. */
  href?: (row: T) => string | null
  detail?: (row: T) => string | null
  /** Filas que no califican. Por defecto entran todas. */
  eligible?: (row: T) => boolean
  /** `asc` para "el que menos": partidas más cortas, menos muertes. */
  order?: 'desc' | 'asc'
  /** Desempate. Sin esto dos valores iguales quedan en el orden que vino la consulta. */
  tiebreak?: (a: T, b: T) => number
  limit?: number
}

export function rankRows<T>(rows: T[], options: RankOptions<T>): StatRow[] {
  const {
    value,
    display,
    id,
    name,
    subtitle,
    logo,
    href,
    detail,
    eligible,
    order = 'desc',
    tiebreak,
    limit = TOP_ROWS,
  } = options

  return rows
    .filter((row) => (eligible ? eligible(row) : true))
    .sort((a, b) => {
      const diff = order === 'desc' ? value(b) - value(a) : value(a) - value(b)
      if (diff !== 0) return diff
      return tiebreak ? tiebreak(a, b) : 0
    })
    .slice(0, limit)
    .map((row) => ({
      id: id(row),
      name: name(row),
      subtitle: subtitle?.(row) ?? null,
      logo: logo?.(row) ?? null,
      href: href?.(row) ?? null,
      detail: detail?.(row) ?? null,
      value: value(row),
      display: display(value(row), row),
    }))
}

/**
 * Arma el bloque, o null si quedó vacío.
 *
 * Devolver null y no un bloque sin filas es a propósito: la página no dibuja
 * títulos de rankings que no tienen a nadie. Antes de la primera fecha, eso es
 * todo el listado.
 */
export function block(
  id: string,
  title: string,
  rows: StatRow[],
  extra: { subtitle?: string | null; note?: string | null } = {},
): StatBlock | null {
  if (rows.length === 0) return null
  return { id, title, rows, subtitle: extra.subtitle ?? null, note: extra.note ?? null }
}
