'use client'

import { GameIcon } from '@/components/match/GameIcon'
import { TablaOrdenable, type Columna } from '@/components/tabla/TablaOrdenable'
import { championIcon } from '@/lib/ddragon'
import { formatNumber, formatPosition, ROLES } from '@/lib/format'
import type { Orden } from '@/lib/tabla/orden'

/**
 * El meta, entero y ordenable.
 *
 * Es la tabla que reemplaza al top cinco para quien viene a mirar en serio: la
 * pregunta "¿cuánto se juega X?" no se contesta con los cinco más elegidos.
 *
 * Las filas llegan planas y con los números ya coercionados desde el servidor:
 * varias de estas columnas son `numeric` en Postgres y pueden viajar como
 * texto, y ordenar texto compara "0.9" contra "0.85" al revés sin avisar.
 */

export interface FilaCampeon {
  /** La clave interna, que es lo que arma la URL del ícono. */
  champion: string
  /** El nombre que se lee: "Wukong" y no "MonkeyKing". */
  nombre: string
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

/** Un porcentaje, o la rayita cuando no hay muestra para calcularlo. */
function pct(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`
}

export function TablaCampeones({
  filas,
  version,
  inicial,
  conBans,
}: {
  filas: FilaCampeon[]
  version: string
  inicial: Orden
  /** Si hay al menos una partida con el draft cargado. */
  conBans: boolean
}) {
  const columnas: Columna<FilaCampeon>[] = [
    {
      id: 'campeon',
      label: 'Campeón',
      align: 'left',
      primero: 'asc',
      sort: (f) => f.nombre,
      cell: (f) => (
        <div className="flex items-center gap-2">
          {/*
            La cara del campeón es lo que se busca al barrer la tabla, más que
            el nombre: a 26px era una mancha de color. La fila crece con ella,
            que en una tabla de 170 filas se paga en scroll, pero encontrar un
            campeón deja de ser leer.
          */}
          <GameIcon src={championIcon(version, f.champion)} alt={f.nombre} size={34} />
          <span className="truncate font-medium">{f.nombre}</span>
        </div>
      ),
    },
    {
      id: 'posicion',
      label: 'Rol',
      align: 'left',
      primero: 'asc',
      // Por el orden de la línea y no alfabético: TOP, JUNGLE, MID, ADC, SUP es
      // como se lee un equipo. Los que no tienen posición van al final.
      sort: (f) => (f.position ? ROLES.indexOf(f.position as (typeof ROLES)[number]) : null),
      cell: (f) => <span className="text-fg-soft">{formatPosition(f.position)}</span>,
    },
    {
      id: 'picks',
      label: 'Picks',
      sort: (f) => f.picks,
      cell: (f) => f.picks,
    },
    {
      // El % en el encabezado y no sólo en la celda: "PR" a secas no dice si el
      // número que viene abajo es una cuenta o una proporción.
      id: 'pickrate',
      label: 'PR %',
      title: 'Pick rate: en qué porcentaje de las partidas del recorte se eligió',
      sort: (f) => f.pickRate,
      cell: (f) => <span className="font-medium text-fg">{pct(f.pickRate)}</span>,
    },
    ...(conBans
      ? ([
          {
            id: 'bans',
            label: 'Bans',
            sort: (f) => f.bans,
            cell: (f) => f.bans,
          },
          {
            id: 'banrate',
            label: 'BR %',
            title: 'Ban rate: en qué porcentaje de las partidas con draft cargado se baneó',
            sort: (f) => f.banRate,
            cell: (f) => pct(f.banRate),
          },
          {
            id: 'presencia',
            label: 'Presencia',
            title: 'Elegido o baneado, sobre las partidas con draft cargado',
            sort: (f) => f.presence,
            cell: (f) => (
              <div className="flex items-center justify-end gap-2">
                <div className="h-1.5 w-14 overflow-hidden bg-raised">
                  <div
                    className="h-full bg-accent-strong"
                    style={{ width: `${Math.min((f.presence ?? 0) * 100, 100)}%` }}
                  />
                </div>
                <span className="w-10 text-right">{pct(f.presence)}</span>
              </div>
            ),
          },
        ] satisfies Columna<FilaCampeon>[])
      : []),
    {
      id: 'winrate',
      label: 'WR',
      title: 'Porcentaje de victorias, con la cantidad de partidas entre paréntesis',
      sort: (f) => f.winPct,
      cell: (f) => (
        <>
          {/*
            El winrate con la muestra al lado. Sin eso, ordenar por WR pone
            arriba a un campeón que se jugó una sola vez y ganó, y la tabla
            parece decir que es el mejor del torneo.
          */}
          <span className="font-medium text-fg">{pct(f.winPct)}</span>{' '}
          <span className="text-xs text-faint">
            ({f.wins}/{f.picks})
          </span>
        </>
      ),
    },
    {
      id: 'kda',
      label: 'KDA',
      sort: (f) => f.kda,
      cell: (f) => (
        <>
          <p>{f.kda.toFixed(2)}</p>
          <p className="text-xs text-faint">
            {f.kills}/{f.deaths}/{f.assists}
          </p>
        </>
      ),
    },
    {
      id: 'dano',
      label: 'Daño',
      title: 'Daño a campeones, promedio por partida',
      sort: (f) => f.avgDamage,
      cell: (f) => <span className="text-fg-soft">{formatNumber(f.avgDamage)}</span>,
    },
  ]

  return (
    <TablaOrdenable
      columnas={columnas}
      filas={filas}
      clave={(f) => f.champion}
      inicial={inicial}
      // Entre dos con el mismo valor va antes el más jugado: un 100% en cuatro
      // partidas dice más que un 100% en una.
      desempate={(a, b) => b.picks - a.picks || a.nombre.localeCompare(b.nombre, 'es')}
      caption="Campeones del torneo"
      minWidth="min-w-[56rem]"
      vacia="Todavía no se jugó ninguna partida en este recorte."
    />
  )
}
