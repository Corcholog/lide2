'use client'

import { GameIcon } from '@/components/match/GameIcon'
import { SortableTable, type Column } from '@/components/table/SortableTable'
import { championIcon } from '@/lib/ddragon'
import { formatNumber, formatPosition, ROLES } from '@/lib/format'
import type { SortOrder } from '@/lib/table/sort'

/**
 * The meta, whole and sortable.
 *
 * It is the table that replaces the top five for anyone who came to look
 * properly: the question "how much does X get played?" is not answered by the
 * five most picked.
 *
 * The rows arrive flat and with the numbers already coerced on the server:
 * several of these columns are `numeric` in Postgres and can travel as text,
 * and sorting text compares "0.9" against "0.85" backwards without a word.
 */

export interface ChampionRow {
  /** The internal key, which is what builds the icon URL. */
  champion: string
  /** The name that gets read: "Wukong" and not "MonkeyKing". */
  name: string
  position: string | null
  picks: number
  wins: number
  losses: number
  winPct: number | null
  pickRate: number | null
  bans: number
  banRate: number | null
  presence: number | null
  kda: number
  kills: number
  deaths: number
  assists: number
  avgDamage: number
}

/** A percentage, or an em dash when there is no sample to compute it from. */
function pct(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`
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
  /** Whether at least one match has its draft entered. */
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
          {/*
            The champion's face is what people scan the table for, more than the
            name: at 26px it was a smudge of colour. The row grows with it,
            which in a 170-row table is paid for in scrolling, but finding a
            champion stops being an act of reading.
          */}
          <GameIcon src={championIcon(version, row.champion)} alt={row.name} size={34} />
          <span className="truncate font-medium">{row.name}</span>
        </div>
      ),
    },
    {
      id: 'posicion',
      label: 'Rol',
      align: 'left',
      firstClick: 'asc',
      // By lane order and not alphabetically: TOP, JUNGLE, MID, ADC, SUP is
      // how a team is read. The ones with no position go last.
      sort: (row) => (row.position ? ROLES.indexOf(row.position as (typeof ROLES)[number]) : null),
      cell: (row) => <span className="text-fg-soft">{formatPosition(row.position)}</span>,
    },
    {
      id: 'picks',
      label: 'Picks',
      sort: (row) => row.picks,
      cell: (row) => row.picks,
    },
    {
      // The % in the header and not only in the cell: a bare "PR" does not say
      // whether the number below is a count or a proportion.
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
            cell: (row) => row.bans,
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
            The win rate with its sample beside it. Without that, sorting by WR
            puts a champion who was played once and won on top, and the table
            appears to say they are the best in the tournament.
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
      sort: (row) => row.kda,
      cell: (row) => (
        <>
          <p>{row.kda.toFixed(2)}</p>
          <p className="text-xs text-faint">
            {row.kills}/{row.deaths}/{row.assists}
          </p>
        </>
      ),
    },
    {
      id: 'dano',
      label: 'Daño',
      title: 'Daño a campeones, promedio por partida',
      sort: (row) => row.avgDamage,
      cell: (row) => <span className="text-fg-soft">{formatNumber(row.avgDamage)}</span>,
    },
  ]

  return (
    <SortableTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.champion}
      initial={initial}
      // Between two on the same value the more-played one comes first: 100%
      // across four games says more than 100% across one.
      tiebreak={(a, b) => b.picks - a.picks || a.name.localeCompare(b.name, 'es')}
      caption="Campeones del torneo"
      minWidth="min-w-[56rem]"
      emptyText="Todavía no se jugó ninguna partida en este recorte."
    />
  )
}
