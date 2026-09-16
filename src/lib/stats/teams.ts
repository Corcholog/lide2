/**
 * Team rankings.
 *
 * Kill difference, gold difference and objectives rank per game: teams play a
 * different number of games per matchday, so totals would favour whoever played
 * more. Win percentage and average duration are already rates. Objective
 * totals remain in the detail line.
 */

import { formatGold, formatPercent } from '@/lib/format'
import { block, rankRows } from './rank'
import type { StatBlock, StatsData } from './types'
import type { TeamPhaseTotalsRow } from '@/types/db'

/** A total divided by games played. */
function perGame(total: number, row: TeamPhaseTotalsRow): number {
  return row.games > 0 ? total / row.games : 0
}

function teamRanking(
  data: StatsData,
  options: {
    value: (row: TeamPhaseTotalsRow) => number
    display: (value: number, row: TeamPhaseTotalsRow) => string
    order?: 'desc' | 'asc'
    eligible?: (row: TeamPhaseTotalsRow) => boolean
    detail?: (row: TeamPhaseTotalsRow) => string | null
  },
) {
  return rankRows(data.teams, {
    id: (row) => row.team_id,
    name: (row) => row.team_name ?? 'Equipo',
    subtitle: (row) => row.group_label,
    logo: (row) => row.team_logo,
    detail: options.detail ?? ((row) => `${row.wins}-${row.losses}`),
    value: options.value,
    display: options.display,
    order: options.order,
    eligible: options.eligible,
    // Tiebreak per game too, so playing more games does not break ties.
    tiebreak: (a, b) =>
      perGame(b.kill_diff, b) - perGame(a.kill_diff, a) ||
      (a.team_name ?? '').localeCompare(b.team_name ?? ''),
  })
}

/** "+7.5", "-3.5", "0.0". */
function signed(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}`
}

export function winrates(data: StatsData): StatBlock | null {
  const rows = teamRanking(data, {
    value: (row) => row.win_pct,
    display: (value) => formatPercent(value),
  })
  return block('winrate', 'Mejor porcentaje', rows, { subtitle: 'Victorias sobre partidas jugadas' })
}

export function killDiff(data: StatsData): StatBlock | null {
  const rows = teamRanking(data, {
    value: (row) => perGame(row.kill_diff, row),
    display: (value) => `${signed(value)} por partida`,
  })
  return block('kill-diff', 'Diferencia de kills', rows, {
    subtitle: 'Las que hicieron menos las que recibieron, por partida',
  })
}

export function goldDiff(data: StatsData): StatBlock | null {
  const rows = teamRanking(data, {
    value: (row) => perGame(row.gold_diff, row),
    // One decimal: per-game gold differences are a few thousand, and rounding
    // to the thousand would leave many teams on the same number.
    display: (value) =>
      `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatGold(Math.abs(value))} por partida`,
  })
  return block('gold-diff', 'Diferencia de oro', rows, {
    subtitle: 'Oro de ventaja sobre el rival, por partida',
  })
}

export function topObjectives(data: StatsData): StatBlock | null {
  const rows = teamRanking(data, {
    value: (row) => perGame(row.objectives, row),
    display: (value) => `${value.toFixed(1)} por partida`,
    /*
      The value ranks objectives per game; the detail line keeps the totals by
      type, because half a herald per game is not meaningful. Initials instead
      of emoji, which render inconsistently across systems, are unreadable at
      12px and get read aloud by screen readers. The subtitle explains them.
    */
    detail: (row) =>
      `${row.wins}-${row.losses} · ${row.dragons}D · ${row.barons}B · ${row.heralds}H`,
    eligible: (row) => row.objectives > 0,
  })
  return block('objetivos', 'Más objetivos', rows, {
    subtitle: 'Dragones, barones y heraldos por partida',
  })
}

/** Average duration, shortest first. */
export function fastestTeams(data: StatsData): StatBlock | null {
  const rows = teamRanking(data, {
    value: (row) => row.avg_minutes,
    display: (value) => `${value.toFixed(1)} min`,
    order: 'asc',
  })
  return block('duracion-equipo', 'Partidas más cortas', rows, {
    subtitle: 'Menor duración promedio',
  })
}
