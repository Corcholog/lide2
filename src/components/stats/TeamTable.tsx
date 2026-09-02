'use client'

import Link from 'next/link'
import { GameIcon } from '@/components/match/GameIcon'
import { SortableTable, type Column } from '@/components/table/SortableTable'
import { formatDuration, formatGold } from '@/lib/format'
import type { SortOrder } from '@/lib/table/sort'

/**
 * The teams within the scope.
 *
 * It does not replace the standings table on the home page, which is the
 * official one and orders by what the rulebook says. This one is for comparing:
 * who racks up more kills, who pulls more of a gold lead, who closes faster.
 */

export interface TeamRow {
  teamId: string
  name: string
  logo: string | null
  group: string | null
  games: number
  wins: number
  losses: number
  winPct: number
  kills: number
  killDiff: number
  goldDiff: number
  objectives: number
  avgMinutes: number
}

/** A difference reads better with its sign attached. */
function withSign(value: number): string {
  return value > 0 ? `+${value}` : String(value)
}

function tone(value: number): string {
  if (value > 0) return 'text-win'
  if (value < 0) return 'text-loss'
  return 'text-muted'
}

export function TeamTable({ rows, initial }: { rows: TeamRow[]; initial: SortOrder }) {
  const columns: Column<TeamRow>[] = [
    {
      id: 'equipo',
      label: 'Equipo',
      align: 'left',
      firstClick: 'asc',
      sort: (row) => row.name,
      cell: (row) => (
        <Link
          href={`/equipos/${row.teamId}`}
          className="flex items-center gap-2 transition-colors hover:text-accent"
        >
          <GameIcon src={row.logo} alt="" size={24} />
          <span className="truncate font-medium">{row.name}</span>
        </Link>
      ),
    },
    {
      id: 'grupo',
      label: 'Grupo',
      align: 'left',
      firstClick: 'asc',
      sort: (row) => row.group,
      cell: (row) => <span className="text-fg-soft">{row.group ?? '—'}</span>,
    },
    {
      id: 'partidas',
      label: 'PJ',
      title: 'Partidas jugadas',
      sort: (row) => row.games,
      cell: (row) => row.games,
    },
    {
      id: 'victorias',
      label: 'V–D',
      title: 'Victorias y derrotas',
      sort: (row) => (row.games === 0 ? null : row.wins),
      cell: (row) => (
        <>
          <span className="text-win">{row.wins}</span>
          <span className="text-dim">–</span>
          <span className="text-loss">{row.losses}</span>
        </>
      ),
    },
    {
      id: 'winrate',
      label: 'WR',
      title: 'Porcentaje de victorias',
      // A team that has not played does not have a 0% win rate: it has no win
      // rate. As null it goes last in both directions, as on /equipos.
      sort: (row) => (row.games === 0 ? null : row.winPct),
      cell: (row) => (
        <span className="font-medium text-fg">
          {row.games === 0 ? '—' : `${Math.round(row.winPct * 100)}%`}
        </span>
      ),
    },
    {
      id: 'kills',
      label: 'Kills',
      sort: (row) => row.kills,
      cell: (row) => row.kills,
    },
    {
      id: 'killdiff',
      label: 'Dif. kills',
      title: 'Kills a favor menos kills en contra',
      sort: (row) => row.killDiff,
      cell: (row) => <span className={tone(row.killDiff)}>{withSign(row.killDiff)}</span>,
    },
    {
      id: 'golddiff',
      label: 'Dif. oro',
      title: 'Oro a favor menos oro en contra',
      sort: (row) => row.goldDiff,
      cell: (row) => (
        <span className={tone(row.goldDiff)}>
          {row.goldDiff > 0 ? '+' : row.goldDiff < 0 ? '−' : ''}
          {formatGold(Math.abs(row.goldDiff))}
        </span>
      ),
    },
    {
      id: 'objetivos',
      label: 'Objetivos',
      title: 'Dragones, barones, heraldos y torres',
      sort: (row) => row.objectives,
      cell: (row) => row.objectives,
    },
    {
      id: 'duracion',
      label: 'Duración',
      title: 'Duración media de sus partidas',
      firstClick: 'asc',
      sort: (row) => (row.games === 0 ? null : row.avgMinutes),
      cell: (row) =>
        row.games === 0 ? (
          <span className="text-dim">—</span>
        ) : (
          formatDuration(row.avgMinutes * 60_000)
        ),
    },
  ]

  return (
    <SortableTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.teamId}
      initial={initial}
      tiebreak={(a, b) => b.games - a.games || a.name.localeCompare(b.name, 'es')}
      caption="Equipos del torneo"
      params={{ order: 'orden-equipos', dir: 'dir-equipos' }}
      minWidth="min-w-[52rem]"
      emptyText="Ningún equipo jugó todavía en este recorte."
    />
  )
}
