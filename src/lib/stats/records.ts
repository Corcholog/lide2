/**
 * Match-level records.
 *
 * They are queried with the same scope as everything else, so the same five
 * functions give "the longest of matchday 2" and "the longest of the whole
 * phase": what changes is the scope, not the stat.
 */

import { formatDuration, formatNumber } from '@/lib/format'
import { matchPath } from '@/lib/routes'
import { block, rankRows } from './rank'
import type { StatBlock, StatsData } from './types'
import type { MatchRecordRow } from '@/types/db'

function versus(row: MatchRecordRow): string {
  return `${row.blue_team_name ?? 'Azul'} vs ${row.red_team_name ?? 'Rojo'}`
}

function matchRanking(
  data: StatsData,
  options: {
    value: (row: MatchRecordRow) => number
    display: (value: number, row: MatchRecordRow) => string
    order?: 'desc' | 'asc'
    eligible?: (row: MatchRecordRow) => boolean
    detail?: (row: MatchRecordRow) => string | null
  },
) {
  return rankRows(data.records, {
    id: (row) => row.match_id,
    name: versus,
    href: (row) => matchPath(row.match_id),
    subtitle: (row) => [row.round_label, row.group_label].filter(Boolean).join(' · ') || null,
    detail:
      options.detail ??
      ((row) => `${row.blue_kills}-${row.red_kills} · ${formatDuration(row.game_length_ms)}`),
    value: options.value,
    display: options.display,
    order: options.order,
    eligible: options.eligible,
    tiebreak: (a, b) => (a.played_at ?? '').localeCompare(b.played_at ?? ''),
  })
}

export function longestMatch(data: StatsData): StatBlock | null {
  const rows = matchRanking(data, {
    value: (row) => row.game_length_ms,
    display: (value) => formatDuration(value),
  })
  return block('mas-larga', 'Las más largas', rows)
}

export function shortestMatch(data: StatsData): StatBlock | null {
  const rows = matchRanking(data, {
    value: (row) => row.game_length_ms,
    display: (value) => formatDuration(value),
    order: 'asc',
  })
  return block('mas-corta', 'Las más cortas', rows)
}

export function mostCombinedKills(data: StatsData): StatBlock | null {
  const rows = matchRanking(data, {
    value: (row) => row.total_kills,
    display: (value) => `${value} kills`,
  })
  return block('mas-kills', 'Las más sangrientas', rows, { subtitle: 'Kills de los dos equipos' })
}

/**
 * The closest one: the smallest gold gap at the end.
 *
 * By gold and not by kills because the gold gap is what says whether the game
 * was open until the end; you can win 20-5 and be level on gold, and the other
 * way round.
 */
export function closestGame(data: StatsData): StatBlock | null {
  const rows = matchRanking(data, {
    value: (row) => row.gold_gap,
    display: (value) => `${formatNumber(Math.round(value / 100) / 10)}k de diferencia`,
    order: 'asc',
    eligible: (row) => row.blue_gold > 0 && row.red_gold > 0,
  })
  return block('mas-pareja', 'Las más parejas', rows, { subtitle: 'Menor diferencia de oro' })
}

export function biggestBlowout(data: StatsData): StatBlock | null {
  const rows = matchRanking(data, {
    value: (row) => row.kill_gap,
    display: (_value, row) => `${row.winner_name ?? '—'} por ${row.kill_gap}`,
    eligible: (row) => row.winner_name !== null,
  })
  return block('paliza', 'Las palizas', rows, { subtitle: 'Mayor diferencia de kills' })
}
