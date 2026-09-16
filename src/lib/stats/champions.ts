/**
 * Champion rankings: what got played and what worked.
 *
 * Picks come from the replays. Bans do not (the .rofl has no draft) and are
 * entered by hand in the admin panel, so ban and presence cards state how many
 * matches they cover and are hidden when no draft has been entered.
 */

import { championIcon, championName } from '@/lib/ddragon'
import { formatNumber, formatPercent, formatRoles } from '@/lib/format'
import { block, rankRows } from './rank'
import type { StatBlock, StatsData } from './types'
import type { ChampionStatRow } from '@/types/db'

/** Minimum picks for a win rate to be meaningful. */
const MIN_PICKS_FOR_WINRATE = 3

/**
 * The short win rate ("0% wr"), or null when the champion was never picked.
 *
 * It accompanies the pick count so a champion picked often but losing every
 * game is not read as a strong pick. Champions that were only banned have a
 * NULL `win_pct`, which is different from losing every game.
 */
function winrate(row: ChampionStatRow): string | null {
  if (row.picks === 0 || row.win_pct === null) return null
  return `${formatPercent(row.win_pct)} wr`
}

/** "4 picks · 0% wr", the start of most detail lines in this section. */
function picksAndWinrate(row: ChampionStatRow): string {
  return [`${row.picks} ${row.picks === 1 ? 'pick' : 'picks'}`, winrate(row)]
    .filter(Boolean)
    .join(' · ')
}

function championRanking(
  data: StatsData,
  options: {
    value: (row: ChampionStatRow) => number
    display: (value: number, row: ChampionStatRow) => string
    eligible?: (row: ChampionStatRow) => boolean
    detail?: (row: ChampionStatRow) => string | null
  },
) {
  // The id is the internal key (e.g. "MonkeyKing"); the displayed name comes
  // from ddragon.
  const names = data.championNames ?? {}
  const version = data.assetVersion

  return rankRows(data.champions, {
    id: (row) => row.champion,
    name: (row) => championName(names, row.champion),
    // Every role played, like the table, so both views agree.
    subtitle: (row) => formatRoles(row.positions, row.position),
    // Without a ddragon version (Riot not responding) the ranking has no icons.
    logo: (row) => (version ? championIcon(version, row.champion) : null),
    detail: options.detail ?? ((row) => `${picksAndWinrate(row)} · KDA ${row.kda.toFixed(2)}`),
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
    // Picks rank; the win rate in parentheses only qualifies the number.
    display: (value, row) => {
      const wr = winrate(row)
      return wr ? `${value} (${wr})` : `${value}`
    },
    // Champions that were only banned have 0 picks and are left out.
    eligible: (row) => row.picks > 0,
    // Picks and win rate are already in the value, so the detail shows the
    // record and KDA.
    detail: (row) => `${row.wins}-${row.losses} · KDA ${row.kda.toFixed(2)}`,
  })
  return block('picks', 'Los más elegidos', rows, { subtitle: 'Picks en el recorte, con su winrate' })
}

export function bestWinrate(data: StatsData): StatBlock | null {
  const rows = championRanking(data, {
    // Not null once `eligible` passes, but the column is nullable.
    value: (row) => row.win_pct ?? 0,
    display: (value, row) => `${formatPercent(value)} (${row.wins}/${row.picks})`,
    eligible: (row) => row.picks >= MIN_PICKS_FOR_WINRATE,
    // The win rate is already the value.
    detail: (row) => `${row.picks} picks · KDA ${row.kda.toFixed(2)}`,
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
    detail: (row) => `${picksAndWinrate(row)} · ${row.bans} bans`,
  })

  return block('bans', 'Los más baneados', rows, {
    note: `Medido sobre ${withBans} de ${total} partidas: el resto no tiene el draft cargado.`,
  })
}

/**
 * Presence: picks plus bans over the matches with a draft entered. Picks are
 * counted over those matches only, so the rate cannot exceed 100%.
 */
export function presence(data: StatsData): StatBlock | null {
  const { withBans, total } = bansCoverage(data)
  if (withBans === 0) return null

  const rows = championRanking(data, {
    value: (row) => row.presence ?? 0,
    display: (value) => formatPercent(value),
    eligible: (row) => (row.presence ?? 0) > 0,
    detail: (row) => `${picksAndWinrate(row)} · ${row.bans} bans`,
  })

  return block('presencia', 'Presencia', rows, {
    subtitle: 'Picks más bans',
    note: `Medido sobre ${withBans} de ${total} partidas: el resto no tiene el draft cargado.`,
  })
}
