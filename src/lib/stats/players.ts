/**
 * Individual rankings.
 *
 * One function per stat, all with the same signature, all pure: they take what
 * `loadStats` already fetched and return the finished block. Adding one means
 * writing a function and listing it in the registry.
 */

import { formatKda, formatNumber, formatPosition, ROLES } from '@/lib/format'
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

function record(row: PlayerPhaseTotalsRow): string {
  return `${formatKda(row.kills, row.deaths, row.assists)} · ${row.games} ${row.games === 1 ? 'partida' : 'partidas'}`
}

/** The shared base of nearly all of them: who, from where, and their KDA line. */
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
    // Only the ones with a page: an account with no `player_id` is one the
    // ingest could not resolve, and there is nowhere to send the reader.
    href: (row) => (row.player_id ? playerPath(row.player_id) : null),
    detail: options.detail ?? record,
    value: options.value,
    display: options.display,
    order: options.order,
    eligible: options.eligible,
    // With few games played, ties are everyday: without a tiebreak, two
    // players on the same number would keep the order Postgres returned them
    // in, which can change between queries.
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
      detail: (row) =>
        `${formatKda(row.kills, row.deaths, row.assists)} · ${Math.round(row.kill_participation * 100)}% de participación`,
      value: (row) => row.avg_score,
      display: (value) => value.toFixed(2),
      // The view already returns it sorted; mvp_rank is what makes it stable.
      tiebreak: (a, b) => a.mvp_rank - b.mvp_rank,
    },
  )

  return block('mvp', 'MVP', rows, {
    subtitle: 'Promedio del score: KDA con techo, participación en kills y un extra por ganar',
  })
}

/**
 * The starting five: the best of each role.
 *
 * The role comes from `position`, which is the one played most within the
 * scope. A player who rotated lanes shows up in the one they repeated most.
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
        detail: record(best),
        value: best.avg_score,
        display: formatPosition(role),
      },
    ]
  })

  return block('quinteto', 'El quinteto', rows, { subtitle: 'El mejor score promedio de cada rol' })
}

export function topKills(data: StatsData): StatBlock | null {
  const rows = playerRanking(data, {
    value: (row) => row.kills,
    display: (value) => `${value}`,
  })
  return block('kills', 'Carnicero', rows, { subtitle: 'Más kills' })
}

export function topAssists(data: StatsData): StatBlock | null {
  const rows = playerRanking(data, {
    value: (row) => row.assists,
    display: (value) => `${value}`,
  })
  return block('assists', 'Manos de seda', rows, { subtitle: 'Más asistencias' })
}

export function bestKda(data: StatsData): StatBlock | null {
  const min = minGamesForAverages(data.scope)
  const rows = playerRanking(data, {
    value: (row) => row.kda,
    display: (value) => value.toFixed(2),
    eligible: (row) => row.games >= min,
  })
  return block('kda', 'Mejor KDA', rows, { subtitle: `Mínimo ${min} ${min === 1 ? 'partida' : 'partidas'}` })
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
  // This replaces first bloods: the .rofl does not record who drew first
  // blood, but it does record each player's longest streak without dying.
  //
  // The bare number ("16 in a row") does not say of what: in a row could be
  // games won, kills or anything else. It ships with its unit attached and the
  // subtitle finishes explaining it.
  return block('racha', 'Imparable', rows, {
    subtitle: 'La racha de kills más larga sin morir',
  })
}

export function topDamage(data: StatsData): StatBlock | null {
  const rows = playerRanking(data, {
    value: (row) => row.damage,
    display: (value) => formatNumber(value),
  })
  return block('dano', 'Más daño a campeones', rows, { subtitle: 'Total del recorte' })
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
  const rows = playerRanking(data, {
    value: (row) => row.wards_killed,
    display: (value) => `${value}`,
    eligible: (row) => row.wards_killed > 0,
  })
  return block('deswardeo', 'A oscuras', rows, { subtitle: 'Más guardianes destruidos' })
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
