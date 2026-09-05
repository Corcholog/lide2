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

/**
 * The win rate, written short, or null when there is none.
 *
 * It rides along with the pick count everywhere in the meta because on its own
 * the count does not say what it is worth: Ornn heading "los más elegidos" with
 * a 4 reads like the pick of the tournament, and those four games were four
 * defeats. Together - "4 (0% wr)" - the card says both things in the same
 * glance.
 *
 * A champion with no picks - one that was only banned, which is what `bans` and
 * `presence` are full of - has a NULL `win_pct` in the view and not a zero, and
 * that is the difference between "lost every game" and "never played one". It
 * comes back null here so the caller leaves the spot empty instead of drawing
 * a 0% nobody earned.
 */
function winrate(row: ChampionStatRow): string | null {
  if (row.picks === 0 || row.win_pct === null) return null
  return `${Math.round(row.win_pct * 100)}% wr`
}

/** "4 picks · 0% wr", the pair that opens nearly every detail line of the meta. */
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
    // The count with its win rate hanging off it. The picks are still the
    // value that sorts the ranking - the parenthesis is a qualifier, not a
    // second criterion - and that is why it goes in the same line and not in a
    // column of its own.
    display: (value, row) => {
      const wr = winrate(row)
      return wr ? `${value} (${wr})` : `${value}`
    },
    // The view also returns champions that were only banned, which have 0
    // picks: in a ranking of the most picked they have no business being.
    eligible: (row) => row.picks > 0,
    // The default detail opens with the picks and the win rate, which are now
    // both in the value: what is left to say is how those games went.
    detail: (row) => `${row.wins}-${row.losses} · KDA ${row.kda.toFixed(2)}`,
  })
  return block('picks', 'Los más elegidos', rows, { subtitle: 'Picks en el recorte, con su winrate' })
}

export function bestWinrate(data: StatsData): StatBlock | null {
  const rows = championRanking(data, {
    // Never null past the `eligible` below - three picks is three games - but
    // the column is nullable and the ranking sorts on a number.
    value: (row) => row.win_pct ?? 0,
    display: (value, row) => `${Math.round(value * 100)}% (${row.wins}/${row.picks})`,
    eligible: (row) => row.picks >= MIN_PICKS_FOR_WINRATE,
    // The win rate is already the value: repeating it in the detail line would
    // be saying the same thing twice on one row.
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
    detail: (row) => `${picksAndWinrate(row)} · ${row.bans} bans`,
  })

  return block('presencia', 'Presencia', rows, {
    subtitle: 'Picks más bans',
    note: `Medido sobre ${withBans} de ${total} partidas: el resto no tiene el draft cargado.`,
  })
}
