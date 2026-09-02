/**
 * The two blocks that do not come out of the stats registry.
 *
 * "Los números" is not a ranking - it is five different figures, not five
 * places in the same thing - and a group's table is not one either: it is
 * ordered by position, which the database already resolved along with its
 * tiebreaks. Both still end up as a `StatBlock`, so they are drawn by the same
 * component as everything else.
 */

import { formatDuration, formatGold, formatNumber } from '@/lib/format'
import type { StatBlock, StatRow, StatsData } from '@/lib/stats/types'
import type { GroupStandingRow, MatchRecordRow } from '@/types/db'

function versus(row: MatchRecordRow): string {
  return `${row.blue_team_name ?? 'Azul'} vs ${row.red_team_name ?? 'Rojo'}`
}

/** The one with the highest (or lowest) value, or null when there are no matches. */
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
 * The matchday's numbers: what gets published without having to pick anybody.
 *
 * It goes first in the batch because it is the piece that can go up the moment
 * everything finishes, without waiting for somebody to check whether the MVP is
 * fair.
 */
export function matchdayNumbers(data: StatsData): StatBlock | null {
  const records = data.records
  if (records.length === 0) return null

  const kills = records.reduce((total, row) => total + row.total_kills, 0)
  const totalMs = records.reduce((total, row) => total + row.game_length_ms, 0)
  const longest = pick(records, (row) => row.game_length_ms)
  const shortest = pick(records, (row) => row.game_length_ms, 'asc')
  // The closest one is measured by gold: you can win 20-5 and have been level
  // until the end, and the other way round. Same criterion as
  // records.closestGame.
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
      // Gold and not kills, which is what it was picked for. With the
      // scoreline in there the piece contradicts itself: the closest game of
      // matchday 1 ended 44-25, and the gold gap there was 1.4k.
      detail: `${formatGold(closest.blue_gold)} vs ${formatGold(closest.red_gold)}`,
    })
  }

  return {
    id: 'numeros',
    title: 'Los números',
    // The accumulated total is not a matchday: it is all three together.
    subtitle: data.scope.matchday === null ? 'Lo que va de la fase' : 'Lo que dejó la jornada',
    rows,
    note: null,
  }
}

/**
 * One table per group.
 *
 * The order comes from the view, which already applied the rulebook's
 * tiebreaks; here it is only grouped and written out. The top two are the ones
 * that qualify, and the note says so because there is no colour in the piece to
 * explain it.
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
