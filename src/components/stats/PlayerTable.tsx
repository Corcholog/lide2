'use client'

import Link from 'next/link'
import { SortableTable, type Column } from '@/components/table/SortableTable'
import { formatNumber, formatPosition, ROLES } from '@/lib/format'
import type { SortOrder } from '@/lib/table/sort'
import { playerPath } from '@/lib/routes'

/**
 * Every player within the scope, with all of their columns.
 *
 * It honours the matchday and group scope, and sorts by whatever you like: it
 * is the one that answers "who does the most damage among Group C's junglers?".
 * Each player's page is reached from here, which is the only route there is:
 * the /jugadores index was removed and the route now returns a 404.
 */

export interface PlayerRow {
  playerId: string
  name: string
  teamId: string | null
  teamName: string | null
  position: string | null
  games: number
  wins: number
  losses: number
  kda: number
  avgKills: number
  avgDeaths: number
  avgAssists: number
  killParticipation: number
  avgDamage: number
  dpm: number
  csm: number
  gpm: number
  avgVision: number
  mvpCount: number
}

export function PlayerTable({ rows, initial }: { rows: PlayerRow[]; initial: SortOrder }) {
  const columns: Column<PlayerRow>[] = [
    {
      id: 'jugador',
      label: 'Jugador',
      align: 'left',
      firstClick: 'asc',
      sort: (row) => row.name,
      cell: (row) => (
        <Link
          href={playerPath(row.playerId)}
          className="font-medium transition-colors hover:text-accent"
        >
          {row.name}
        </Link>
      ),
    },
    {
      id: 'equipo',
      label: 'Equipo',
      align: 'left',
      firstClick: 'asc',
      sort: (row) => row.teamName,
      cell: (row) =>
        row.teamId && row.teamName ? (
          <Link
            href={`/equipos/${row.teamId}`}
            className="truncate text-fg-soft transition-colors hover:text-accent"
          >
            {row.teamName}
          </Link>
        ) : (
          <span className="text-dim">sin equipo</span>
        ),
    },
    {
      id: 'posicion',
      label: 'Rol',
      align: 'left',
      firstClick: 'asc',
      sort: (row) => (row.position ? ROLES.indexOf(row.position as (typeof ROLES)[number]) : null),
      cell: (row) => <span className="text-fg-soft">{formatPosition(row.position)}</span>,
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
      title: 'Victorias y losses',
      sort: (row) => (row.games === 0 ? null : row.wins / row.games),
      cell: (row) => (
        <>
          <span className="text-win">{row.wins}</span>
          <span className="text-dim">–</span>
          <span className="text-loss">{row.losses}</span>
        </>
      ),
    },
    {
      id: 'kda',
      label: 'KDA',
      sort: (row) => row.kda,
      cell: (row) => (
        <>
          <p className="font-medium text-fg">{row.kda.toFixed(2)}</p>
          <p className="text-xs text-faint">
            {row.avgKills}/{row.avgDeaths}/{row.avgAssists}
          </p>
        </>
      ),
    },
    {
      id: 'kp',
      label: 'KP',
      title: 'Participación en las kills de su equipo',
      sort: (row) => row.killParticipation,
      cell: (row) => `${Math.round(row.killParticipation * 100)}%`,
    },
    {
      id: 'dano',
      label: 'Daño',
      title: 'Daño a campeones, promedio por partida',
      sort: (row) => row.avgDamage,
      cell: (row) => formatNumber(row.avgDamage),
    },
    {
      id: 'dpm',
      label: 'DPM',
      title: 'Daño por minuto',
      sort: (row) => row.dpm,
      cell: (row) => Math.round(row.dpm),
    },
    {
      id: 'csm',
      label: 'CS/min',
      sort: (row) => row.csm,
      cell: (row) => row.csm.toFixed(1),
    },
    {
      id: 'gpm',
      label: 'Oro/min',
      sort: (row) => row.gpm,
      cell: (row) => Math.round(row.gpm),
    },
    {
      id: 'vision',
      label: 'Visión',
      title: 'Puntaje de visión, promedio por partida',
      sort: (row) => row.avgVision,
      cell: (row) => row.avgVision,
    },
    {
      id: 'mvp',
      label: 'MVP',
      title: 'Veces que fue la mejor puntuación de su partida',
      sort: (row) => row.mvpCount,
      cell: (row) =>
        row.mvpCount > 0 ? (
          <span className="bg-accent-strong px-1.5 py-0.5 text-xs font-bold text-white">
            {row.mvpCount}
          </span>
        ) : (
          <span className="text-dim">—</span>
        ),
    },
  ]

  return (
    <SortableTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.playerId}
      initial={initial}
      tiebreak={(a, b) => b.games - a.games || a.name.localeCompare(b.name, 'es')}
      caption="Jugadores del torneo"
      params={{ order: 'orden-jugadores', dir: 'dir-jugadores' }}
      minWidth="min-w-[64rem]"
      emptyText="Nadie jugó todavía en este recorte."
    />
  )
}
