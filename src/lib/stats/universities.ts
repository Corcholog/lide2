/**
 * Rankings por universidad.
 *
 * La unidad de todo esto es la APARICIÓN (un jugador en una partida), no el
 * partido, porque cuatro equipos mezclan hasta tres universidades: el Equipo 15
 * es de UNER, UADE y UNLP a la vez, y un partido suyo le suma a las tres según
 * qué jugadores pusieron. Contar partidos obligaría a decidir de quién es un
 * partido que jugaron tres universidades juntas, y no hay respuesta correcta.
 *
 * Consecuencia visible: cuando un equipo de una sola universidad gana, esa
 * universidad suma 5 victorias, no 1. Todas se miden igual, así que el ranking
 * no se distorsiona, pero los textos lo aclaran para que nadie lea "5" como
 * cinco partidos.
 */

import { formatNumber } from '@/lib/format'
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
      ((row) => `${row.teams} ${row.teams === 1 ? 'equipo' : 'equipos'} · ${row.players} jugadores`),
    value: options.value,
    display: options.display,
    eligible: options.eligible,
    tiebreak: (a, b) => b.kda - a.kda || (a.university_tag ?? '').localeCompare(b.university_tag ?? ''),
  })
}

/**
 * La tabla de universidades: porcentaje de victorias de sus jugadores.
 *
 * Con un mínimo de apariciones para que una universidad que puso un solo
 * jugador en un solo partido no encabece la tabla con el 100%.
 */
export function universityStandings(data: StatsData): StatBlock | null {
  const min = minGamesForAverages(data.scope) * 5
  const rows = universityRanking(data, {
    value: (row) => row.win_pct,
    display: (value) => `${Math.round(value * 100)}%`,
    eligible: (row) => row.appearances >= min,
    detail: (row) => `${row.wins}-${row.losses} en ${row.appearances} apariciones`,
  })

  return block('universidades', 'Tabla de universidades', rows, {
    subtitle: 'Victorias de sus jugadores sobre el total de sus apariciones',
    note: 'Se cuenta por jugador y no por partido: hay equipos que representan a varias universidades a la vez.',
  })
}

export function universityKills(data: StatsData): StatBlock | null {
  const rows = universityRanking(data, {
    value: (row) => row.kills,
    display: (value) => `${value}`,
  })
  return block('universidades-kills', 'Más kills por universidad', rows)
}

export function universityDamage(data: StatsData): StatBlock | null {
  const rows = universityRanking(data, {
    value: (row) => row.damage,
    display: (value) => formatNumber(value),
  })
  return block('universidades-dano', 'Más daño por universidad', rows)
}

/**
 * Universidad de la fecha: la que mejor rindió, midiendo por el score promedio
 * de sus jugadores en vez de por victorias.
 *
 * Va por promedio y no por total a propósito: si no, siempre ganaría la que más
 * equipos metió en el torneo. UNLP puso seis y UNCuyo uno.
 */
export function universityOfTheDay(data: StatsData): StatBlock | null {
  const min = minGamesForAverages(data.scope) * 5
  const rows = universityRanking(data, {
    value: (row) => row.avg_score,
    display: (value) => value.toFixed(2),
    eligible: (row) => row.appearances >= min,
    detail: (row) => `${Math.round(row.win_pct * 100)}% de victorias · KDA ${row.kda.toFixed(2)}`,
  })

  return block('universidad-fecha', 'Universidad destacada', rows, {
    subtitle: 'Mejor score promedio de sus jugadores',
  })
}
