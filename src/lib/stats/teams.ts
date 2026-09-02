/** Per-team rankings. */

import { formatNumber } from '@/lib/format'
import { block, rankRows } from './rank'
import type { StatBlock, StatsData } from './types'
import type { TeamPhaseTotalsRow } from '@/types/db'

function teamRanking(
  data: StatsData,
  options: {
    value: (row: TeamPhaseTotalsRow) => number
    display: (value: number, row: TeamPhaseTotalsRow) => string
    order?: 'desc' | 'asc'
    eligible?: (row: TeamPhaseTotalsRow) => boolean
  },
) {
  return rankRows(data.teams, {
    id: (row) => row.team_id,
    name: (row) => row.team_name ?? 'Equipo',
    subtitle: (row) => row.group_label,
    logo: (row) => row.team_logo,
    detail: (row) => `${row.wins}-${row.losses}`,
    value: options.value,
    display: options.display,
    order: options.order,
    eligible: options.eligible,
    tiebreak: (a, b) => b.kill_diff - a.kill_diff || (a.team_name ?? '').localeCompare(b.team_name ?? ''),
  })
}

export function winrates(data: StatsData): StatBlock | null {
  const rows = teamRanking(data, {
    value: (row) => row.win_pct,
    display: (value) => `${Math.round(value * 100)}%`,
  })
  return block('winrate', 'Mejor porcentaje', rows, { subtitle: 'Victorias sobre partidas jugadas' })
}

export function killDiff(data: StatsData): StatBlock | null {
  const rows = teamRanking(data, {
    value: (row) => row.kill_diff,
    display: (value) => (value > 0 ? `+${value}` : `${value}`),
  })
  return block('kill-diff', 'Diferencia de kills', rows, {
    subtitle: 'Las que hicieron menos las que recibieron',
  })
}

export function goldDiff(data: StatsData): StatBlock | null {
  const rows = teamRanking(data, {
    value: (row) => row.gold_diff,
    display: (value) =>
      `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatNumber(Math.abs(Math.round(value / 1000)))}k`,
  })
  return block('gold-diff', 'Diferencia de oro', rows)
}

export function topObjectives(data: StatsData): StatBlock | null {
  const rows = teamRanking(data, {
    value: (row) => row.objectives,
    /*
      The initial of each objective and not an emoji: the dragon and the herald
      are drawn differently on every system — and on Windows the eye comes out
      light blue, which is not a herald — they get lost at 12px, and a screen
      reader reads them as "dragon" in the middle of a figure. The subtitle says
      what each letter is.
    */
    display: (_value, row) => `${row.dragons}D · ${row.barons}B · ${row.heralds}H`,
    eligible: (row) => row.objectives > 0,
  })
  return block('objetivos', 'Más objetivos', rows, { subtitle: 'Dragones, barones y heraldos' })
}

/**
 * Average duration, from the fastest to the slowest.
 *
 * Ascending on purpose: what is interesting here is who closes games out fast,
 * not who drags them on.
 */
export function fastestTeams(data: StatsData): StatBlock | null {
  const rows = teamRanking(data, {
    value: (row) => row.avg_minutes,
    display: (value) => `${value.toFixed(1)} min`,
    order: 'asc',
  })
  return block('duracion-equipo', 'Los más expeditivos', rows, {
    subtitle: 'Menor duración promedio',
  })
}
