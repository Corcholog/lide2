/**
 * Rankings individuales.
 *
 * Una función por estadística, todas con la misma firma, todas puras: reciben
 * lo que ya trajo `loadStats` y devuelven el bloque listo. Agregar una es
 * escribir una función y sumarla al registro.
 */

import { formatKda, formatNumber, formatPosition } from '@/lib/format'
import { block, minGamesForAverages, rankRows } from './rank'
import type { StatBlock, StatsData } from './types'
import type { PlayerPhaseTotalsRow } from '@/types/db'

/** Equipo y universidad, que es lo que ubica a un jugador en el torneo. */
function who(row: PlayerPhaseTotalsRow): string | null {
  return [row.team_name, row.university_tag].filter(Boolean).join(' · ') || null
}

function key(row: PlayerPhaseTotalsRow): string {
  return row.player_id ?? `${row.team_id ?? 'sin-equipo'}-${row.player_name ?? '?'}`
}

function record(row: PlayerPhaseTotalsRow): string {
  return `${formatKda(row.kills, row.deaths, row.assists)} · ${row.games} ${row.games === 1 ? 'partida' : 'partidas'}`
}

/** Base común de casi todos: quién es, de dónde, y su línea de KDA. */
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
    detail: options.detail ?? record,
    value: options.value,
    display: options.display,
    order: options.order,
    eligible: options.eligible,
    // Con pocas partidas los empates son moneda corriente: sin desempate, dos
    // jugadores con el mismo número quedarían en el orden en que los devolvió
    // Postgres, que puede cambiar entre consultas.
    tiebreak: (a, b) => b.avg_score - a.avg_score || (a.player_name ?? '').localeCompare(b.player_name ?? ''),
  })
}

/** El MVP lo calcula la base (vista `tournament_mvp`), acá sólo se presenta. */
export function mvp(data: StatsData): StatBlock | null {
  const rows = rankRows(
    [...data.mvp].sort((a, b) => a.mvp_rank - b.mvp_rank),
    {
      id: (row) => row.player_id ?? `${row.player_name}`,
      name: (row) => row.player_name ?? 'Desconocido',
      subtitle: (row) => [row.team_name, row.university_tag].filter(Boolean).join(' · ') || null,
      detail: (row) =>
        `${formatKda(row.kills, row.deaths, row.assists)} · ${Math.round(row.kill_participation * 100)}% de participación`,
      value: (row) => row.avg_score,
      display: (value) => value.toFixed(2),
      // Ya viene ordenado por la vista; el orden estable lo da mvp_rank.
      tiebreak: (a, b) => a.mvp_rank - b.mvp_rank,
    },
  )

  return block('mvp', 'MVP', rows, {
    subtitle: 'Promedio del score: KDA con techo, participación en kills y un extra por ganar',
  })
}

/**
 * El quinteto: el mejor de cada rol.
 *
 * El rol sale de `position`, que es el que más jugó en el recorte. Un jugador
 * que rotó de línea aparece en la que más repitió.
 */
export function bestFive(data: StatsData): StatBlock | null {
  const ROLES = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY']

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
    display: (value) => `${value} seguidas`,
    eligible: (row) => row.best_killing_spree > 0,
  })
  // Reemplaza a los first bloods: el .rofl no guarda quién hizo la primera
  // sangre, pero sí la racha más larga sin morir de cada jugador.
  return block('racha', 'Imparable', rows, { subtitle: 'La racha más larga sin morir' })
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

export function topDamageMitigated(data: StatsData): StatBlock | null {
  const rows = playerRanking(data, {
    value: (row) => row.damage_mitigated,
    display: (value) => formatNumber(value),
    eligible: (row) => row.damage_mitigated > 0,
  })
  return block('mitigado', 'Muralla', rows, { subtitle: 'Más daño mitigado' })
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
  return block('vision', 'Ojo del torneo', rows, { subtitle: 'Mejor puntaje de visión' })
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
