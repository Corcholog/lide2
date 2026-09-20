/**
 * University rankings.
 *
 * The unit is the appearance (one player in one match), not the match: mixed
 * teams represent up to three universities, and a match played by such a team
 * adds to each university its players signed up with. So a win by a
 * single-university team adds five wins to that university. The cards say so
 * in their note.
 */

import { formatNumber, formatPercent } from '@/lib/format'
import { block, minGamesForAverages, rankRows } from './rank'
import type { StatBlock, StatsData } from './types'
import type { UniversityTotalsRow } from '@/types/db'

function universityRanking(
  data: StatsData,
  options: {
    value: (row: UniversityTotalsRow) => number
    display: (value: number, row: UniversityTotalsRow) => string
    eligible?: (row: UniversityTotalsRow) => boolean
    detail?: (row: UniversityTotalsRow) => string | null
  },
) {
  return rankRows(data.universities, {
    id: (row) => row.university_id,
    name: (row) => row.university_tag ?? '—',
    subtitle: (row) => row.university_name,
    logo: (row) => row.university_logo,
    detail:
      options.detail ??
      ((row) =>
        `${counted(row.teams, 'equipo', 'equipos')} · ${counted(row.players, 'jugador', 'jugadores')}`),
    value: options.value,
    display: options.display,
    eligible: options.eligible,
    tiebreak: (a, b) => b.kda - a.kda || (a.university_tag ?? '').localeCompare(b.university_tag ?? ''),
  })
}

/**
 * The note shown on every card of this section, explaining the per-player
 * count. It is a `note` rather than a section heading because cards are
 * exported to Instagram one at a time (see `StatPoster`).
 */
const PER_PLAYER =
  'Cuenta por jugador: en un plantel mixto, la misma partida suma para más de una universidad.'

/**
 * The university table: win percentage of their players, with a minimum of
 * appearances so a single game cannot top it at 100%.
 */
export function universityStandings(data: StatsData): StatBlock | null {
  const min = minGamesForAverages(data.scope) * 5
  const rows = universityRanking(data, {
    value: (row) => row.win_pct,
    display: (value) => formatPercent(value),
    eligible: (row) => row.appearances >= min,
    // Record plus number of players, so "47-0" is not read as matches.
    detail: (row) => `${row.wins}-${row.losses} · ${counted(row.players, 'jugador', 'jugadores')}`,
  })

  return block('universidades', 'Tabla de universidades', rows, {
    subtitle: 'Porcentaje de victorias de sus jugadores',
    note: PER_PLAYER,
  })
}

/**
 * "1 equipo", "3 equipos", "1 jugador", "15 jugadores". Both forms are passed
 * in because Spanish plurals are not regular ("equipos", "jugadores").
 */
function counted(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`
}

/**
 * A total divided by appearances, the unit used across this section. Unlike
 * totals or per-team figures, it compares universities fairly regardless of
 * how many teams they entered or how many games those teams played.
 */
function perAppearance(total: number, row: UniversityTotalsRow): number {
  return row.appearances > 0 ? total / row.appearances : 0
}

export function universityKills(data: StatsData): StatBlock | null {
  const rows = universityRanking(data, {
    value: (row) => perAppearance(row.kills, row),
    display: (value) => `${value.toFixed(1)} por partida`,
  })

  return block('universidades-kills', 'Más kills por universidad', rows, {
    subtitle: 'Kills de cada jugador por partida',
    note: PER_PLAYER,
  })
}

export function universityDamage(data: StatsData): StatBlock | null {
  const rows = universityRanking(data, {
    value: (row) => perAppearance(row.damage, row),
    display: (value) => `${formatNumber(Math.round(value))} por partida`,
  })

  return block('universidades-dano', 'Más daño por universidad', rows, {
    subtitle: 'Daño de cada jugador por partida',
    note: PER_PLAYER,
  })
}

/**
 * University of the matchday: the best average score of its players. Averaged,
 * not summed, so entering more teams is not an advantage.
 */
export function universityOfTheDay(data: StatsData): StatBlock | null {
  const min = minGamesForAverages(data.scope) * 5
  const rows = universityRanking(data, {
    value: (row) => row.avg_score,
    display: (value) => value.toFixed(2),
    eligible: (row) => row.appearances >= min,
    // No detail line: the win percentage is on the next card, and the freed
    // line lets long university names wrap.
    detail: () => null,
  })

  return block('universidad-fecha', 'Universidad destacada', rows, {
    subtitle: 'Mejor score (KDA) promedio de sus jugadores',
    note: PER_PLAYER,
  })
}
