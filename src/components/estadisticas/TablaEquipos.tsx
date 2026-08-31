'use client'

import Link from 'next/link'
import { GameIcon } from '@/components/match/GameIcon'
import { TablaOrdenable, type Columna } from '@/components/tabla/TablaOrdenable'
import { formatDuration, formatGold } from '@/lib/format'
import type { Orden } from '@/lib/tabla/orden'

/**
 * Los equipos del recorte.
 *
 * No reemplaza a la tabla de posiciones de la portada, que es la oficial y
 * ordena por lo que dice el reglamento. Esta es para comparar: quién hace más
 * kills, quién saca más ventaja de oro, quién cierra más rápido.
 */

export interface FilaEquipo {
  teamId: string
  nombre: string
  logo: string | null
  grupo: string | null
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

/** Una diferencia se lee mejor con el signo puesto. */
function conSigno(value: number): string {
  return value > 0 ? `+${value}` : String(value)
}

function tono(value: number): string {
  if (value > 0) return 'text-win'
  if (value < 0) return 'text-loss'
  return 'text-muted'
}

export function TablaEquipos({ filas, inicial }: { filas: FilaEquipo[]; inicial: Orden }) {
  const columnas: Columna<FilaEquipo>[] = [
    {
      id: 'equipo',
      label: 'Equipo',
      align: 'left',
      primero: 'asc',
      sort: (f) => f.nombre,
      cell: (f) => (
        <Link
          href={`/equipos/${f.teamId}`}
          className="flex items-center gap-2 transition-colors hover:text-accent"
        >
          <GameIcon src={f.logo} alt="" size={24} />
          <span className="truncate font-medium">{f.nombre}</span>
        </Link>
      ),
    },
    {
      id: 'grupo',
      label: 'Grupo',
      align: 'left',
      primero: 'asc',
      sort: (f) => f.grupo,
      cell: (f) => <span className="text-fg-soft">{f.grupo ?? '—'}</span>,
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
      sort: (f) => (f.games === 0 ? null : f.wins),
      cell: (f) => (
        <>
          <span className="text-win">{f.wins}</span>
          <span className="text-dim">–</span>
          <span className="text-loss">{f.losses}</span>
        </>
      ),
    },
    {
      id: 'winrate',
      label: 'WR',
      title: 'Porcentaje de victorias',
      // Un equipo que no jugó no tiene 0% de victorias: no tiene winrate. Con
      // null se va al final en las dos direcciones, como en /equipos.
      sort: (f) => (f.games === 0 ? null : f.winPct),
      cell: (f) => (
        <span className="font-medium text-fg">
          {f.games === 0 ? '—' : `${Math.round(f.winPct * 100)}%`}
        </span>
      ),
    },
    {
      id: 'kills',
      label: 'Kills',
      sort: (f) => f.kills,
      cell: (f) => f.kills,
    },
    {
      id: 'killdiff',
      label: 'Dif. kills',
      title: 'Kills a favor menos kills en contra',
      sort: (f) => f.killDiff,
      cell: (f) => <span className={tono(f.killDiff)}>{conSigno(f.killDiff)}</span>,
    },
    {
      id: 'golddiff',
      label: 'Dif. oro',
      title: 'Oro a favor menos oro en contra',
      sort: (f) => f.goldDiff,
      cell: (f) => (
        <span className={tono(f.goldDiff)}>
          {f.goldDiff > 0 ? '+' : f.goldDiff < 0 ? '−' : ''}
          {formatGold(Math.abs(f.goldDiff))}
        </span>
      ),
    },
    {
      id: 'objetivos',
      label: 'Objetivos',
      title: 'Dragones, barones, heraldos y torres',
      sort: (f) => f.objectives,
      cell: (f) => f.objectives,
    },
    {
      id: 'duracion',
      label: 'Duración',
      title: 'Duración media de sus partidas',
      primero: 'asc',
      sort: (f) => (f.games === 0 ? null : f.avgMinutes),
      cell: (f) =>
        f.games === 0 ? (
          <span className="text-dim">—</span>
        ) : (
          formatDuration(f.avgMinutes * 60_000)
        ),
    },
  ]

  return (
    <TablaOrdenable
      columnas={columnas}
      filas={filas}
      clave={(f) => f.teamId}
      inicial={inicial}
      desempate={(a, b) => b.games - a.games || a.nombre.localeCompare(b.nombre, 'es')}
      caption="Equipos del torneo"
      params={{ orden: 'orden-equipos', dir: 'dir-equipos' }}
      minWidth="min-w-[52rem]"
      vacia="Ningún equipo jugó todavía en este recorte."
    />
  )
}
