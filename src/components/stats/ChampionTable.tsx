'use client'

import { GameIcon } from '@/components/match/GameIcon'
import { SortableTable, type Column } from '@/components/table/SortableTable'
import { championIcon } from '@/lib/ddragon'
import { formatNumber, formatPercent, formatRoles, ROLES } from '@/lib/format'
import type { SortOrder } from '@/lib/table/sort'

/**
 * The full champion table, sortable. Rows arrive with numbers already coerced
 * on the server (see the Tables page).
 */

/** A total divided by picks, formatted with one decimal. */
function perPick(total: number, picks: number): string {
  return picks > 0 ? (total / picks).toFixed(1) : '0.0'
}

export interface ChampionRow {
  /** The internal key, used for the icon URL. */
  champion: string
  /** Display name: "Wukong", not "MonkeyKing". */
  name: string
  /** The role played most, which the Roles column sorts on. */
  position: string | null
  /** Every role it was played in. */
  positions: string[]
  picks: number
  wins: number
  losses: number
  winPct: number | null
  pickRate: number | null
  /** Null on single-role rows: bans apply to a champion, not a lane. */
  bans: number | null
  banRate: number | null
  presence: number | null
  /** The average of each game's KDA, not the ratio over the totals. */
  kda: number
  kills: number
  deaths: number
  assists: number
  /** Damage to champions per minute, averaged over the champion's picks. */
  dpm: number
}

/** A percentage, or an em dash when there is no sample to compute it from. */
function pct(value: number | null): string {
  return value === null ? '—' : formatPercent(value)
}

export function ChampionTable({
  rows,
  version,
  initial,
  hasBans,
}: {
  rows: ChampionRow[]
  version: string
  initial: SortOrder
  /**
   * Whether to show the three ban columns: off with no draft entered, and off
   * with a role selected.
   */
  hasBans: boolean
}) {
  const columns: Column<ChampionRow>[] = [
    {
      id: 'campeon',
      label: 'Campeón',
      align: 'left',
      firstClick: 'asc',
      sort: (row) => row.name,
      cell: (row) => (
        <div className="flex items-center gap-2">
          {/* A larger portrait, since people scan the table by champion face. */}
          <GameIcon src={championIcon(version, row.champion)} alt={row.name} size={34} />
          <span className="truncate font-medium">{row.name}</span>
        </div>
      ),
    },
    {
      id: 'posicion',
      // Plural: champions are often played in more than one role.
      label: 'Roles',
      align: 'left',
      firstClick: 'asc',
      // Sorted by main role, in lane order; champions without a role go last.
      sort: (row) => (row.position ? ROLES.indexOf(row.position as (typeof ROLES)[number]) : null),
      cell: (row) => (
        <span className="text-fg-soft">{formatRoles(row.positions, row.position)}</span>
      ),
    },
    {
      id: 'picks',
      label: 'Picks',
      sort: (row) => row.picks,
      cell: (row) => row.picks,
    },
    {
      // "%" in the header, so it reads as a proportion rather than a count.
      id: 'pickrate',
      label: 'PR %',
      title: 'Pick rate: en qué porcentaje de las partidas del recorte se eligió',
      sort: (row) => row.pickRate,
      cell: (row) => <span className="font-medium text-fg">{pct(row.pickRate)}</span>,
    },
    ...(hasBans
      ? ([
          {
            id: 'bans',
            label: 'Bans',
            sort: (row) => row.bans,
            // Only drawn with `hasBans`, which is off whenever a role is picked,
            // so the null is never shown.
            cell: (row) => row.bans ?? '—',
          },
          {
            id: 'banrate',
            label: 'BR %',
            title: 'Ban rate: en qué porcentaje de las partidas con draft cargado se baneó',
            sort: (row) => row.banRate,
            cell: (row) => pct(row.banRate),
          },
          {
            id: 'presencia',
            label: 'Presencia',
            title: 'Elegido o baneado, sobre las partidas con draft cargado',
            sort: (row) => row.presence,
            cell: (row) => (
              <div className="flex items-center justify-end gap-2">
                <div className="h-1.5 w-14 overflow-hidden bg-raised">
                  <div
                    className="h-full bg-accent-strong"
                    style={{ width: `${Math.min((row.presence ?? 0) * 100, 100)}%` }}
                  />
                </div>
                <span className="w-10 text-right">{pct(row.presence)}</span>
              </div>
            ),
          },
        ] satisfies Column<ChampionRow>[])
      : []),
    {
      id: 'winrate',
      label: 'WR',
      title: 'Porcentaje de victorias, con la cantidad de partidas entre paréntesis',
      sort: (row) => row.winPct,
      cell: (row) => (
        <>
          {/*
            The win rate with its sample size, so one game won does not read as
            the best champion.
          */}
          <span className="font-medium text-fg">{pct(row.winPct)}</span>{' '}
          <span className="text-xs text-faint">
            ({row.wins}/{row.picks})
          </span>
        </>
      ),
    },
    {
      id: 'kda',
      label: 'KDA',
      title: 'El KDA de cada partida, promediado sobre los picks del campeón',
      sort: (row) => row.kda,
      /*
        The K/D/A line is per pick too, matching the averaged KDA above it.
      */
      cell: (row) => (
        <>
          <p>{row.kda.toFixed(2)}</p>
          <p className="text-xs text-faint">
            {perPick(row.kills, row.picks)}/{perPick(row.deaths, row.picks)}/
            {perPick(row.assists, row.picks)}
          </p>
        </>
      ),
    },
    {
      id: 'dano',
      label: 'Daño/min',
      title: 'Daño a campeones por minuto, promediado sobre los picks del campeón',
      sort: (row) => row.dpm,
      cell: (row) => <span className="text-fg-soft">{formatNumber(row.dpm)}</span>,
    },
  ]

  return (
    <SortableTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.champion}
      initial={initial}
      // On equal values, more picks first.
      tiebreak={(a, b) => b.picks - a.picks || a.name.localeCompare(b.name, 'es')}
      caption="Campeones del torneo"
      minWidth="min-w-[56rem]"
      emptyText="Todavía no se jugó ninguna partida en este recorte."
    />
  )
}
