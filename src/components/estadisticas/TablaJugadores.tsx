'use client'

import Link from 'next/link'
import { TablaOrdenable, type Columna } from '@/components/tabla/TablaOrdenable'
import { formatNumber, formatPosition, ROLES } from '@/lib/format'
import type { Orden } from '@/lib/tabla/orden'
import { rutaJugador } from '@/lib/rutas'

/**
 * Todos los jugadores del recorte, con todas sus columnas.
 *
 * La tabla de /jugadores es el histórico del torneo y tiene un orden fijo; esta
 * respeta el recorte de fecha y grupo, y se ordena por lo que uno quiera. Es la
 * que sirve para "¿quién es el que más daño hace de los junglas del Grupo C?".
 */

export interface FilaJugador {
  playerId: string
  nombre: string
  teamId: string | null
  equipo: string | null
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

export function TablaJugadores({ filas, inicial }: { filas: FilaJugador[]; inicial: Orden }) {
  const columnas: Columna<FilaJugador>[] = [
    {
      id: 'jugador',
      label: 'Jugador',
      align: 'left',
      primero: 'asc',
      sort: (f) => f.nombre,
      cell: (f) => (
        <Link
          href={rutaJugador(f.playerId)}
          className="font-medium transition-colors hover:text-accent"
        >
          {f.nombre}
        </Link>
      ),
    },
    {
      id: 'equipo',
      label: 'Equipo',
      align: 'left',
      primero: 'asc',
      sort: (f) => f.equipo,
      cell: (f) =>
        f.teamId && f.equipo ? (
          <Link
            href={`/equipos/${f.teamId}`}
            className="truncate text-fg-soft transition-colors hover:text-accent"
          >
            {f.equipo}
          </Link>
        ) : (
          <span className="text-dim">sin equipo</span>
        ),
    },
    {
      id: 'posicion',
      label: 'Rol',
      align: 'left',
      primero: 'asc',
      sort: (f) => (f.position ? ROLES.indexOf(f.position as (typeof ROLES)[number]) : null),
      cell: (f) => <span className="text-fg-soft">{formatPosition(f.position)}</span>,
    },
    {
      id: 'partidas',
      label: 'PJ',
      title: 'Partidas jugadas',
      sort: (f) => f.games,
      cell: (f) => f.games,
    },
    {
      id: 'victorias',
      label: 'V–D',
      title: 'Victorias y derrotas',
      sort: (f) => (f.games === 0 ? null : f.wins / f.games),
      cell: (f) => (
        <>
          <span className="text-win">{f.wins}</span>
          <span className="text-dim">–</span>
          <span className="text-loss">{f.losses}</span>
        </>
      ),
    },
    {
      id: 'kda',
      label: 'KDA',
      sort: (f) => f.kda,
      cell: (f) => (
        <>
          <p className="font-medium text-fg">{f.kda.toFixed(2)}</p>
          <p className="text-xs text-faint">
            {f.avgKills}/{f.avgDeaths}/{f.avgAssists}
          </p>
        </>
      ),
    },
    {
      id: 'kp',
      label: 'KP',
      title: 'Participación en las kills de su equipo',
      sort: (f) => f.killParticipation,
      cell: (f) => `${Math.round(f.killParticipation * 100)}%`,
    },
    {
      id: 'dano',
      label: 'Daño',
      title: 'Daño a campeones, promedio por partida',
      sort: (f) => f.avgDamage,
      cell: (f) => formatNumber(f.avgDamage),
    },
    {
      id: 'dpm',
      label: 'DPM',
      title: 'Daño por minuto',
      sort: (f) => f.dpm,
      cell: (f) => Math.round(f.dpm),
    },
    {
      id: 'csm',
      label: 'CS/min',
      sort: (f) => f.csm,
      cell: (f) => f.csm.toFixed(1),
    },
    {
      id: 'gpm',
      label: 'Oro/min',
      sort: (f) => f.gpm,
      cell: (f) => Math.round(f.gpm),
    },
    {
      id: 'vision',
      label: 'Visión',
      title: 'Puntaje de visión, promedio por partida',
      sort: (f) => f.avgVision,
      cell: (f) => f.avgVision,
    },
    {
      id: 'mvp',
      label: 'MVP',
      title: 'Veces que fue la mejor puntuación de su partida',
      sort: (f) => f.mvpCount,
      cell: (f) =>
        f.mvpCount > 0 ? (
          <span className="bg-accent-strong px-1.5 py-0.5 text-xs font-bold text-white">
            {f.mvpCount}
          </span>
        ) : (
          <span className="text-dim">—</span>
        ),
    },
  ]

  return (
    <TablaOrdenable
      columnas={columnas}
      filas={filas}
      clave={(f) => f.playerId}
      inicial={inicial}
      desempate={(a, b) => b.games - a.games || a.nombre.localeCompare(b.nombre, 'es')}
      caption="Jugadores del torneo"
      params={{ orden: 'orden-jugadores', dir: 'dir-jugadores' }}
      minWidth="min-w-[64rem]"
      vacia="Nadie jugó todavía en este recorte."
    />
  )
}
