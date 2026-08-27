/**
 * Los dos bloques que no salen del registro de estadísticas.
 *
 * "Los números" no es un ranking —son cinco cifras distintas, no cinco puestos
 * de lo mismo— y la tabla de un grupo tampoco: se ordena por posición, que ya
 * viene resuelta por la base con sus desempates. Igual los dos terminan en
 * `StatBlock`, así se dibujan con el mismo componente que todo el resto.
 */

import { formatDuration, formatGold, formatNumber } from '@/lib/format'
import type { StatBlock, StatRow, StatsData } from '@/lib/stats/types'
import type { GroupStandingRow, MatchRecordRow } from '@/types/db'

function versus(row: MatchRecordRow): string {
  return `${row.blue_team_name ?? 'Azul'} vs ${row.red_team_name ?? 'Rojo'}`
}

/** El de mayor (o menor) valor, o null si no hay partidas. */
function pick(
  records: MatchRecordRow[],
  value: (row: MatchRecordRow) => number,
  order: 'desc' | 'asc' = 'desc',
): MatchRecordRow | null {
  if (records.length === 0) return null

  return records.reduce((best, row) =>
    order === 'desc' ? (value(row) > value(best) ? row : best) : value(row) < value(best) ? row : best,
  )
}

/**
 * Los números de la fecha: lo que se publica sin tener que elegir a nadie.
 *
 * Va primero en el lote porque es la pieza que se puede subir apenas termina de
 * jugarse todo, sin esperar a que nadie revise si el MVP es justo.
 */
export function matchdayNumbers(data: StatsData): StatBlock | null {
  const records = data.records
  if (records.length === 0) return null

  const kills = records.reduce((total, row) => total + row.total_kills, 0)
  const totalMs = records.reduce((total, row) => total + row.game_length_ms, 0)
  const longest = pick(records, (row) => row.game_length_ms)
  const shortest = pick(records, (row) => row.game_length_ms, 'asc')
  // La más pareja se mide por oro: se puede ganar 20-5 y haber estado parejo
  // hasta el final, y al revés. Mismo criterio que records.closestGame.
  const closest = pick(
    records.filter((row) => row.blue_gold > 0 && row.red_gold > 0),
    (row) => row.gold_gap,
    'asc',
  )

  const rows: StatRow[] = [
    {
      id: 'partidas',
      name: 'Partidas jugadas',
      value: records.length,
      display: formatNumber(records.length),
      detail: `${formatDuration(totalMs)} de juego`,
    },
    {
      id: 'kills',
      name: 'Kills totales',
      value: kills,
      display: formatNumber(kills),
      detail: `${(kills / records.length).toFixed(1)} por partida`,
    },
  ]

  if (longest) {
    rows.push({
      id: 'mas-larga',
      name: 'La más larga',
      subtitle: versus(longest),
      value: longest.game_length_ms,
      display: formatDuration(longest.game_length_ms),
      detail: `${longest.blue_kills}-${longest.red_kills}`,
    })
  }

  if (shortest && shortest.match_id !== longest?.match_id) {
    rows.push({
      id: 'mas-corta',
      name: 'La más corta',
      subtitle: versus(shortest),
      value: shortest.game_length_ms,
      display: formatDuration(shortest.game_length_ms),
      detail: `${shortest.blue_kills}-${shortest.red_kills}`,
    })
  }

  if (closest) {
    rows.push({
      id: 'mas-pareja',
      name: 'La más pareja',
      subtitle: versus(closest),
      value: closest.gold_gap,
      display: `${formatNumber(Math.round(closest.gold_gap / 100) / 10)}k de oro`,
      // El oro y no las kills, que es por lo que se la eligió. Puesto el
      // marcador, la pieza se contradice sola: la más pareja de la fecha 1
      // terminó 44-25, y ahí la diferencia de oro fue de 1,4k.
      detail: `${formatGold(closest.blue_gold)} vs ${formatGold(closest.red_gold)}`,
    })
  }

  return {
    id: 'numeros',
    title: 'Los números',
    // El acumulado no es una jornada: son las tres juntas.
    subtitle: data.scope.matchday === null ? 'Lo que va de la fase' : 'Lo que dejó la jornada',
    rows,
    note: null,
  }
}

/**
 * Una tabla por grupo.
 *
 * El orden viene de la vista, que ya aplicó los desempates del reglamento; acá
 * sólo se agrupa y se escribe. Los dos primeros son los que clasifican, y eso
 * se dice en la aclaración porque en la pieza no hay color que lo explique.
 */
export function groupTables(standings: GroupStandingRow[]): StatBlock[] {
  const groups = new Map<string, GroupStandingRow[]>()
  for (const row of standings) {
    groups.set(row.group_label, [...(groups.get(row.group_label) ?? []), row])
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, rows]) => ({
      id: `tabla-${label.toLowerCase().replace(/\s+/g, '-')}`,
      title: label,
      subtitle: 'Tabla de posiciones',
      note: 'Clasifican los dos primeros',
      rows: rows
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((row) => ({
          id: row.team_id,
          name: row.team_name,
          subtitle: row.university_tags.join(' / ') || null,
          logo: row.team_logo,
          value: row.wins,
          display: `${row.wins}-${row.losses}`,
          detail:
            row.games === 0
              ? 'sin jugar'
              : `${row.kill_diff > 0 ? '+' : ''}${row.kill_diff} ${
                  Math.abs(row.kill_diff) === 1 ? 'kill' : 'kills'
                }`,
        })),
    }))
}
