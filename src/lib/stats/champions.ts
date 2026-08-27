/**
 * El meta: qué se jugó y qué funcionó.
 *
 * Los picks salen del scoreboard, así que están siempre. Los bans no: el .rofl
 * no guarda el draft y hay que cargarlos a mano desde el panel, partida por
 * partida, cuando los equipos manden su historial. Puede no pasar nunca.
 *
 * Por eso los bloques de bans y de presencia aclaran sobre cuántas partidas se
 * midieron y desaparecen si no hay ninguna cargada: una presencia del 60%
 * calculada sobre 3 de 40 partidas no es una estadística del torneo.
 */

import { formatNumber, formatPosition } from '@/lib/format'
import { block, rankRows } from './rank'
import type { StatBlock, StatsData } from './types'
import type { ChampionStatRow } from '@/types/db'

/** Picks mínimos para que un porcentaje de victorias signifique algo. */
const MIN_PICKS_FOR_WINRATE = 3

function championRanking(
  data: StatsData,
  options: {
    value: (row: ChampionStatRow) => number
    display: (value: number, row: ChampionStatRow) => string
    eligible?: (row: ChampionStatRow) => boolean
    detail?: (row: ChampionStatRow) => string | null
  },
) {
  return rankRows(data.champions, {
    id: (row) => row.champion,
    name: (row) => row.champion,
    subtitle: (row) => formatPosition(row.position),
    detail: options.detail ?? ((row) => `${row.picks} ${row.picks === 1 ? 'pick' : 'picks'} · KDA ${row.kda.toFixed(2)}`),
    value: options.value,
    display: options.display,
    eligible: options.eligible,
    tiebreak: (a, b) => b.picks - a.picks || a.champion.localeCompare(b.champion),
  })
}

/** Cuántas partidas del recorte tienen el draft cargado. */
function bansCoverage(data: StatsData): { withBans: number; total: number } {
  const row = data.champions[0]
  return { withBans: row?.matches_with_bans ?? 0, total: row?.matches ?? data.records.length }
}

export function mostPicked(data: StatsData): StatBlock | null {
  const rows = championRanking(data, {
    value: (row) => row.picks,
    display: (value) => `${value}`,
    // La vista también trae los que sólo se banearon, que tienen 0 picks: en un
    // ranking de los más elegidos no pintan nada.
    eligible: (row) => row.picks > 0,
  })
  return block('picks', 'Los más elegidos', rows, { subtitle: 'Picks en el recorte' })
}

export function bestWinrate(data: StatsData): StatBlock | null {
  const rows = championRanking(data, {
    value: (row) => row.win_pct,
    display: (value, row) => `${Math.round(value * 100)}% (${row.wins}/${row.picks})`,
    eligible: (row) => row.picks >= MIN_PICKS_FOR_WINRATE,
  })
  return block('winrate-campeon', 'Los que más ganan', rows, {
    subtitle: `Mínimo ${MIN_PICKS_FOR_WINRATE} picks`,
  })
}

export function topChampionDamage(data: StatsData): StatBlock | null {
  const rows = championRanking(data, {
    value: (row) => row.avg_damage,
    display: (value) => formatNumber(value),
    eligible: (row) => row.picks >= MIN_PICKS_FOR_WINRATE,
  })
  return block('dano-campeon', 'Más daño promedio', rows, {
    subtitle: `Mínimo ${MIN_PICKS_FOR_WINRATE} picks`,
  })
}

export function mostBanned(data: StatsData): StatBlock | null {
  const { withBans, total } = bansCoverage(data)
  if (withBans === 0) return null

  const rows = championRanking(data, {
    value: (row) => row.bans,
    display: (value) => `${value}`,
    eligible: (row) => row.bans > 0,
    detail: (row) => `${row.picks} picks · ${row.bans} bans`,
  })

  return block('bans', 'Los más baneados', rows, {
    note: `Medido sobre ${withBans} de ${total} partidas: el resto no tiene el draft cargado.`,
  })
}

/**
 * Presencia: picks + bans sobre las partidas con draft cargado.
 *
 * Los picks del numerador también se cuentan sólo sobre esas partidas, si no el
 * porcentaje mezclaría dos universos distintos y podría pasarse del 100%.
 */
export function presence(data: StatsData): StatBlock | null {
  const { withBans, total } = bansCoverage(data)
  if (withBans === 0) return null

  const rows = championRanking(data, {
    value: (row) => row.presence ?? 0,
    display: (value) => `${Math.round(value * 100)}%`,
    eligible: (row) => (row.presence ?? 0) > 0,
    detail: (row) => `${row.picks} picks · ${row.bans} bans`,
  })

  return block('presencia', 'Presencia', rows, {
    subtitle: 'Picks más bans',
    note: `Medido sobre ${withBans} de ${total} partidas: el resto no tiene el draft cargado.`,
  })
}
