/**
 * The two card blocks that are not rankings: the matchday's numbers and the
 * group tables. Both are returned as `StatBlock` so the same component draws
 * them.
 */

import { formatDuration, formatGold, formatNumber } from '@/lib/format'
import { versus } from '@/lib/stats/records'
import type { StatBlock, StatRow, StatsData } from '@/lib/stats/types'
import type { GroupStandingRow, MatchRecordRow } from '@/types/db'

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
 * The matchday's numbers. First in the batch because it needs no editorial
 * review and can be published right away.
 */
export function matchdayNumbers(data: StatsData): StatBlock | null {
  const records = data.records
  if (records.length === 0) return null

  const kills = records.reduce((total, row) => total + row.total_kills, 0)
  const longest = pick(records, (row) => row.game_length_ms)
  const shortest = pick(records, (row) => row.game_length_ms, 'asc')
  // Closest game by gold, same criterion as `closestGame` in records.ts.
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
      // No detail line: total playing time just restates the match count.
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
      // Gold, not the kill score, which can look lopsided in a close game.
      detail: `${formatGold(closest.blue_gold)} vs ${formatGold(closest.red_gold)}`,
    })
  }

  return {
    id: 'numeros',
    title: 'Los números',
    // With no matchday selected this covers the whole phase.
    subtitle: data.scope.matchday === null ? 'Lo que va de la fase' : 'Lo que dejó la jornada',
    rows,
    note: null,
  }
}

/**
 * One table per group, in the order the view returns (tiebreaks already
 * applied). The note explains that the top two qualify, since the exported
 * image has no color cue for it.
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
