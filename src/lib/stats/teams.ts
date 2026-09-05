/**
 * Per-team rankings.
 *
 * WHAT ACCUMULATES GOES PER GAME. The kill difference, the gold difference and
 * the objectives were totals, and a total only ranks anything when everybody
 * has played the same amount. They have not: the fixture gives some teams one
 * game in a matchday and others two, so a team that turned up twice led the
 * kill difference over one that turned up once and won by more. That is a
 * ranking of the calendar, not of the teams.
 *
 * Divided by games played, the three say what they were always meant to say -
 * how much a team wins by - and the order stops moving every time a matchday
 * is uneven. The win percentage and the average duration were already rates,
 * so they are untouched.
 *
 * The totals do not disappear: the objectives keep theirs in the detail line,
 * where the D, B and H are still read as counts.
 */

import { block, rankRows } from './rank'
import type { StatBlock, StatsData } from './types'
import type { TeamPhaseTotalsRow } from '@/types/db'

/** A total turned into what it is worth per game. */
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
    // The tiebreak goes per game as well: breaking a tie between two averages
    // with a total puts whoever played more first, which is the very thing
    // these rankings stopped doing.
    tiebreak: (a, b) =>
      perGame(b.kill_diff, b) - perGame(a.kill_diff, a) ||
      (a.team_name ?? '').localeCompare(b.team_name ?? ''),
  })
}

/** "+7.5", "-3.5", "0.0": the sign is what says which side of zero it fell. */
function signed(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}`
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
    // One decimal and not the rounded thousands of before: a game's difference
    // is a few thousand gold, and rounded to the thousand half the table came
    // out on the same number.
    display: (value) =>
      `${value > 0 ? '+' : value < 0 ? '−' : ''}${(Math.abs(value) / 1000).toFixed(1)}k por partida`,
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
      The breakdown moves to the detail line, and stays a total: an average of
      "0.5 heralds" is a number nobody has ever taken. So the value ranks - how
      many objectives a game this team takes - and the line below says which
      ones they were.

      The initial of each objective and not an emoji: the dragon and the herald
      are drawn differently on every system — and on Windows the eye comes out
      light blue, which is not a herald — they get lost at 12px, and a screen
      reader reads them as "dragon" in the middle of a figure. The subtitle says
      what each letter is.
    */
    detail: (row) =>
      `${row.wins}-${row.losses} · ${row.dragons}D · ${row.barons}B · ${row.heralds}H`,
    eligible: (row) => row.objectives > 0,
  })
  return block('objetivos', 'Más objetivos', rows, {
    subtitle: 'Dragones, barones y heraldos por partida',
  })
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
