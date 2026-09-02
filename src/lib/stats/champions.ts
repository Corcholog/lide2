/**
 * The meta: what got played and what worked.
 *
 * Picks come from the scoreboard, so they are always there. Bans are not: the
 * .rofl does not store the draft and they have to be entered by hand from the
 * admin panel, match by match, whenever the teams send their history. That may
 * never happen.
 *
 * That is why the bans and presence blocks state how many matches they were
 * measured over, and disappear when none is entered: a 60% presence computed
 * over 3 matches out of 40 is not a tournament stat.
 */

import { championIcon, championName } from '@/lib/ddragon'
import { formatNumber, formatPosition } from '@/lib/format'
import { block, rankRows } from './rank'
import type { StatBlock, StatsData } from './types'
import type { ChampionStatRow } from '@/types/db'

/** Minimum picks for a win percentage to mean anything. */
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
  // The id is still the internal key - it is the only unique thing - but the
  // name that gets read is ddragon's: in the database Wukong is "MonkeyKing".
  const names = data.championNames ?? {}
  const version = data.assetVersion

  return rankRows(data.champions, {
    id: (row) => row.champion,
    name: (row) => championName(names, row.champion),
    subtitle: (row) => formatPosition(row.position),
    // The champion portrait. Without the ddragon version there is no URL to
    // build and the ranking comes out iconless, which is exactly what happens
    // when Riot does not answer: it reads the same.
    logo: (row) => (version ? championIcon(version, row.champion) : null),
    detail: options.detail ?? ((row) => `${row.picks} ${row.picks === 1 ? 'pick' : 'picks'} · KDA ${row.kda.toFixed(2)}`),
    value: options.value,
    display: options.display,
    eligible: options.eligible,
    tiebreak: (a, b) => b.picks - a.picks || a.champion.localeCompare(b.champion),
  })
}

/** How many matches in the scope have their draft entered. */
function bansCoverage(data: StatsData): { withBans: number; total: number } {
  const row = data.champions[0]
  return { withBans: row?.matches_with_bans ?? 0, total: row?.matches ?? data.records.length }
}

export function mostPicked(data: StatsData): StatBlock | null {
  const rows = championRanking(data, {
    value: (row) => row.picks,
    display: (value) => `${value}`,
    // The view also returns champions that were only banned, which have 0
    // picks: in a ranking of the most picked they have no business being.
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
 * Presence: picks + bans over the matches whose draft is entered.
 *
 * The picks in the numerator are counted over those matches only as well;
 * otherwise the percentage would mix two different universes and could go past
 * 100%.
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
