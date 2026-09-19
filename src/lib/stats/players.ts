/**
 * Player rankings. Each stat is a pure function over the data `loadStats`
 * already fetched, and is listed in the registry.
 */

import { formatKda, formatKdaAverage, formatNumber, formatPercent, formatPosition, ROLES } from '@/lib/format'
import { playerPath } from '@/lib/routes'
import { block, minGamesForAverages, rankRows } from './rank'
import type { StatBlock, StatsData } from './types'
import type { PlayerPhaseTotalsRow } from '@/types/db'

/** Team and university, which is what places a player in the tournament. */
function who(row: PlayerPhaseTotalsRow): string | null {
  return [row.team_name, row.university_tag].filter(Boolean).join(' · ') || null
}

function key(row: PlayerPhaseTotalsRow): string {
  return row.player_id ?? `${row.team_id ?? 'no-team'}-${row.player_name ?? '?'}`
}

/**
 * "Mínimo 2 partidas", or null when the minimum is one: a minimum of one game
 * excludes nobody, so it is not worth printing.
 */
function minimumNote(min: number): string | null {
  return min > 1 ? `Mínimo ${min} partidas` : null
}

/** "1 partida" / "3 partidas": the ending of every detail line. */
function played(games: number): string {
  return `${games} ${games === 1 ? 'partida' : 'partidas'}`
}

/** Total K/D/A for the scope. Only used by the ranking built on totals. */
function record(row: PlayerPhaseTotalsRow): string {
  return `${formatKda(row.kills, row.deaths, row.assists)} · ${played(row.games)}`
}

/** K/D/A per game, the unit most player rankings use. */
function average(row: PlayerPhaseTotalsRow): string {
  return `${formatKdaAverage(row.avg_kills, row.avg_deaths, row.avg_assists)} · ${played(row.games)}`
}

/** A total divided by games played, for stats the view does not average. */
function perGame(total: number, games: number): number {
  return games > 0 ? total / games : 0
}

/** Shared setup for most player rankings: name, team and university, K/D/A line. */
function playerRanking(
  data: StatsData,
  options: {
    value: (row: PlayerPhaseTotalsRow) => number
    display: (value: number, row: PlayerPhaseTotalsRow) => string
    order?: 'desc' | 'asc'
    eligible?: (row: PlayerPhaseTotalsRow) => boolean
    detail?: (row: PlayerPhaseTotalsRow) => string | null
  },
) {
  return rankRows(data.players, {
    id: key,
    name: (row) => row.player_name ?? 'Desconocido',
    subtitle: who,
    // Accounts the ingest could not resolve have no `player_id` and no page.
    href: (row) => (row.player_id ? playerPath(row.player_id) : null),
    detail: options.detail ?? average,
    value: options.value,
    display: options.display,
    order: options.order,
    eligible: options.eligible,
    // Ties are common with few games played; without a tiebreak the order
    // would depend on what Postgres returned.
    tiebreak: (a, b) => b.avg_score - a.avg_score || (a.player_name ?? '').localeCompare(b.player_name ?? ''),
  })
}

/** The MVP is computed by the database (`tournament_mvp` view); this only presents it. */
export function mvp(data: StatsData): StatBlock | null {
  const rows = rankRows(
    [...data.mvp].sort((a, b) => a.mvp_rank - b.mvp_rank),
    {
      id: (row) => row.player_id ?? `${row.player_name}`,
      name: (row) => row.player_name ?? 'Desconocido',
      href: (row) => (row.player_id ? playerPath(row.player_id) : null),
      subtitle: (row) => [row.team_name, row.university_tag].filter(Boolean).join(' · ') || null,
      // Per game, like the score. The view has no averages, so they are
      // computed from the totals.
      detail: (row) =>
        `${formatKdaAverage(
          perGame(row.kills, row.games),
          perGame(row.deaths, row.games),
          perGame(row.assists, row.games),
        )} · ${formatPercent(row.kill_participation)} de participación`,
      value: (row) => row.avg_score,
      display: (value) => value.toFixed(2),
      // The view already returns it sorted; mvp_rank is what makes it stable.
      tiebreak: (a, b) => a.mvp_rank - b.mvp_rank,
    },
  )

  return block('mvp', 'MVP', rows, {
    // The score caps the KDA so a deathless game does not dominate; the
    // subtitle leaves that detail out.
    subtitle: 'Promedio del score: KDA, participación en kills y un extra por ganar',
  })
}

/**
 * The best player of each role, by `position` (the lane played most in the
 * scope).
 */
export function bestFive(data: StatsData): StatBlock | null {
  const rows = ROLES.flatMap((role) => {
    const best = data.players
      .filter((row) => row.position === role)
      .sort((a, b) => b.avg_score - a.avg_score || b.kda - a.kda)[0]

    if (!best) return []

    return [
      {
        id: `${role}-${key(best)}`,
        name: best.player_name ?? 'Desconocido',
        subtitle: who(best),
        logo: null,
        href: best.player_id ? playerPath(best.player_id) : null,
        detail: average(best),
        value: best.avg_score,
        display: formatPosition(role),
      },
    ]
  })

  return block('quinteto', 'El quinteto', rows, {
    subtitle: 'El mejor score (KDA) promedio de cada rol',
  })
}

/*
  Volume stats (kills, assists, damage, wards destroyed) rank per game, like in
  `teams.ts`: teams play a different number of games per matchday, so totals
  would favour whoever played more. The detail line is per game too, so both
  numbers on a card share a unit. Totals remain in /estadisticas/tablas and on
  each player's page.

  Exceptions: "Mejor KDA" ranks the ratio of totals, so its line shows totals.
  `best_killing_spree` is a maximum and multikills are counts of rare events;
  neither is averaged.
*/

export function topKills(data: StatsData): StatBlock | null {
  const rows = playerRanking(data, {
    value: (row) => row.avg_kills,
    display: (value) => `${value.toFixed(1)} por partida`,
  })
  return block('kills', 'Carnicero', rows, { subtitle: 'Kills por partida' })
}

export function topAssists(data: StatsData): StatBlock | null {
  const rows = playerRanking(data, {
    value: (row) => row.avg_assists,
    display: (value) => `${value.toFixed(1)} por partida`,
  })
  return block('assists', 'Manos de seda', rows, { subtitle: 'Asistencias por partida' })
}

export function bestKda(data: StatsData): StatBlock | null {
  const min = minGamesForAverages(data.scope)
  const rows = playerRanking(data, {
    value: (row) => row.kda,
    display: (value) => value.toFixed(2),
    eligible: (row) => row.games >= min,
    // Totals, because this ratio is computed from them.
    detail: record,
  })
  return block('kda', 'Mejor KDA', rows, {
    subtitle: ['Sobre el total del recorte', minimumNote(min)].filter(Boolean).join(' · '),
  })
}

/**
 * The average of each game's KDA, next to `bestKda` (the ratio of totals).
 *
 * They answer different questions: the ratio of totals rewards consistency,
 * while the per-game average lets a single deathless game count in full. Both
 * subtitles say which one they show. Uses the shared minimum of games like the
 * other averages.
 */
export function bestAverageKda(data: StatsData): StatBlock | null {
  const min = minGamesForAverages(data.scope)
  const rows = playerRanking(data, {
    value: (row) => row.avg_kda,
    display: (value) => value.toFixed(2),
    // The `typeof` guard keeps the page working if the code is deployed before
    // migration 0025 adds `avg_kda`: the card is hidden instead of `toFixed`
    // throwing and taking down every ranking.
    eligible: (row) => row.games >= min && typeof row.avg_kda === 'number',
  })
  return block('kda-promedio', 'Mayor KDA promedio', rows, {
    subtitle: ['El KDA de cada partida, promediado', minimumNote(min)].filter(Boolean).join(' · '),
  })
}

export function fewestDeaths(data: StatsData): StatBlock | null {
  const min = minGamesForAverages(data.scope)
  const rows = playerRanking(data, {
    value: (row) => row.avg_deaths,
    display: (value) => `${value.toFixed(2)} por partida`,
    order: 'asc',
    eligible: (row) => row.games >= min,
  })
  return block('muertes', 'Escurridizo', rows, { subtitle: 'Menos muertes por partida' })
}

export function longestKillingSpree(data: StatsData): StatBlock | null {
  const rows = playerRanking(data, {
    value: (row) => row.best_killing_spree,
    display: (value) => `${value} kills`,
    eligible: (row) => row.best_killing_spree > 0,
  })
  // Stands in for first bloods, which the .rofl does not record. The value
  // carries its unit ("16 kills") and the subtitle explains the streak.
  return block('racha', 'Imparable', rows, {
    subtitle: 'La racha de kills más larga sin morir',
  })
}

/**
 * Damage per game. Not the same as damage per minute: a player who wins fast
 * can lead one and trail in the other. `avg_damage` is averaged by the view.
 */
export function topDamage(data: StatsData): StatBlock | null {
  const rows = playerRanking(data, {
    value: (row) => row.avg_damage,
    display: (value) => `${formatNumber(value)} por partida`,
  })
  return block('dano', 'Más daño a campeones', rows, { subtitle: 'Daño a campeones por partida' })
}

export function topDpm(data: StatsData): StatBlock | null {
  const min = minGamesForAverages(data.scope)
  const rows = playerRanking(data, {
    value: (row) => row.dpm,
    display: (value) => `${formatNumber(value)} por minuto`,
    eligible: (row) => row.games >= min,
  })
  return block('dpm', 'Daño por minuto', rows)
}

export function topCsPerMin(data: StatsData): StatBlock | null {
  const min = minGamesForAverages(data.scope)
  const rows = playerRanking(data, {
    value: (row) => row.csm,
    display: (value) => `${value.toFixed(1)} por minuto`,
    eligible: (row) => row.games >= min,
  })
  return block('csm', 'Más farmeo', rows, { subtitle: 'CS por minuto' })
}

export function topGpm(data: StatsData): StatBlock | null {
  const min = minGamesForAverages(data.scope)
  const rows = playerRanking(data, {
    value: (row) => row.gpm,
    display: (value) => `${formatNumber(value)} por minuto`,
    eligible: (row) => row.games >= min,
  })
  return block('gpm', 'Oro por minuto', rows)
}

export function topVision(data: StatsData): StatBlock | null {
  const min = minGamesForAverages(data.scope)
  const rows = playerRanking(data, {
    value: (row) => row.avg_vision,
    display: (value) => `${value.toFixed(1)} por partida`,
    eligible: (row) => row.games >= min,
  })
  return block('vision', 'Ojo de águila', rows, { subtitle: 'Mejor puntaje de visión' })
}

export function topWardsKilled(data: StatsData): StatBlock | null {
  // The view has no per-game column for wards destroyed, so it is divided here.
  const rows = playerRanking(data, {
    value: (row) => (row.games > 0 ? row.wards_killed / row.games : 0),
    display: (value) => `${value.toFixed(1)} por partida`,
    eligible: (row) => row.wards_killed > 0,
  })
  return block('deswardeo', 'A oscuras', rows, {
    subtitle: 'Guardianes destruidos por partida',
  })
}

export function multikills(data: StatsData): StatBlock | null {
  const score = (row: PlayerPhaseTotalsRow) =>
    row.penta_kills * 1000 + row.quadra_kills * 100 + row.triple_kills

  const rows = playerRanking(data, {
    value: score,
    display: (_value, row) =>
      [
        row.penta_kills ? `${row.penta_kills} penta` : null,
        row.quadra_kills ? `${row.quadra_kills} quadra` : null,
        row.triple_kills ? `${row.triple_kills} triple` : null,
      ]
        .filter(Boolean)
        .join(' · '),
    eligible: (row) => score(row) > 0,
  })

  return block('multikills', 'Multikills', rows, { subtitle: 'Triples, quadras y pentas' })
}
