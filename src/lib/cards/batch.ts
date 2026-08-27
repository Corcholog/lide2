/**
 * El lote de piezas de un recorte.
 *
 * Son las estadísticas que valen como publicación, no las 34 del registro: un
 * feed no aguanta un posteo por ranking, y la mitad de esos rankings existen
 * para consultar, no para mirar. La lista de acá es una decisión editorial y
 * está pensada para cambiarse.
 *
 * El lote cambia según el recorte, que es el punto de todo el motor: una fecha
 * se cuenta con quién la rompió, y la fase entera con quién la sostuvo tres
 * fechas seguidas. Por eso son dos listas y no una con más items.
 */

import { STATS } from '@/lib/stats/registry'
import type { StatScope, StatsData } from '@/lib/stats/types'
import type { GroupStandingRow } from '@/types/db'
import { groupTables, matchdayNumbers } from './summary'
import type { Poster } from './types'

/**
 * Qué se publica de una fecha: el que más rindió, el quinteto, la universidad
 * destacada y el meta. Rankings acumulativos como "más kills" no van: en una
 * sola jornada premian al que jugó dos partidos en vez de uno.
 */
export const POR_FECHA = ['mvp', 'quinteto', 'universidad-fecha', 'picks', 'bans']

/**
 * Qué se publica del acumulado: ahí sí los totales significan algo, y entran
 * los récords, que necesitan varias partidas para tener gracia.
 */
export const ACUMULADO = [
  'mvp',
  'quinteto',
  'kills',
  'racha',
  'dano',
  'universidades',
  'winrate',
  'picks',
  'bans',
  'mas-larga',
  'mas-kills',
  'mas-pareja',
]

/** "Fecha 2 · Fase de grupos", el renglón chico de arriba de cada pieza. */
export function kickerFor(scope: StatScope): string {
  const phase = scope.phase === 'grupos' ? 'Fase de grupos' : 'Playoffs'
  return scope.matchday === null ? `Acumulado · ${phase}` : `Fecha ${scope.matchday} · ${phase}`
}

export function buildPosters(data: StatsData, standings: GroupStandingRow[] = []): Poster[] {
  const kicker = kickerFor(data.scope)
  const wanted = data.scope.matchday === null ? ACUMULADO : POR_FECHA

  // Los números primero: es la única que se puede subir sin que nadie revise
  // nada, apenas termina de jugarse la fecha.
  const numbers = matchdayNumbers(data)
  const opening: Poster[] = numbers
    ? [{ id: numbers.id, block: numbers, kicker, ordered: false }]
    : []

  // El orden es el de la lista, no el del registro: la lista es el orden en que
  // se publican y ahí sí importa cuál abre.
  const ranked = wanted
    .map((id) => STATS.find((stat) => stat.id === id))
    .filter((stat) => stat !== undefined)
    .map((stat) => stat.build(data))
    // Las que no tienen datos suficientes devuelven null y quedan afuera: sin
    // bans cargados no hay pieza de bans, y una card vacía es peor que ninguna.
    .filter((block) => block !== null)
    .map((block) => ({ id: block.id, block, kicker, ordered: true }))

  // La tabla sí es un ranking: el número es la posición del equipo en el grupo.
  const tables = groupTables(standings).map((block) => ({
    id: block.id,
    block,
    kicker,
    ordered: true,
  }))

  return [...opening, ...ranked, ...tables]
}
