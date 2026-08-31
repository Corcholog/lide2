import Link from 'next/link'
import { BarraDeDano } from '@/components/match/BarraDeDano'
import { GameIcon } from '@/components/match/GameIcon'
import { championIcon, championName } from '@/lib/ddragon'
import { formatGold, formatKda, playerName, riotTag } from '@/lib/format'
import type { MatchTeamStatsRow } from '@/types/db'
import { rutaJugador } from '@/lib/rutas'

/**
 * Lo que se ve al desplegar una partida del listado.
 *
 * Es un scoreboard compacto: los diez jugadores con lo que se mira primero
 * —campeón, KDA, daño, CS, oro— y los objetivos de cada equipo. Alcanza para
 * saber qué pasó sin salir de la lista, que es lo que uno hace cuando revisa
 * una fecha entera.
 *
 * NO REUSA `Scoreboard`: esa pide items y hechizos, o sea siete íconos más por
 * jugador y las columnas correspondientes de la vista. Para sesenta partidas
 * precargadas eso es traer y dibujar de más algo que acá no se mira; para eso
 * está la ficha, que es un clic más abajo.
 */

/** Lo mínimo de un jugador para el detalle. Sin items ni hechizos, a propósito. */
export interface JugadorDetalle {
  matchPlayerId: string
  side: 100 | 200
  playerId: string | null
  champion: string
  position: string | null
  riotGameName: string | null
  riotTagLine: string | null
  kills: number
  deaths: number
  assists: number
  killParticipation: number
  cs: number
  csm: number
  goldEarned: number
  damageToChampions: number
  visionScore: number
  isMvp: boolean
}

export function DetallePartida({
  matchId,
  jugadores,
  equipos,
  nombres,
  version,
  championNames: names,
}: {
  matchId: string
  jugadores: JugadorDetalle[]
  /** Los totales de cada lado, para los objetivos. */
  equipos: Map<100 | 200, MatchTeamStatsRow>
  nombres: { 100: string; 200: string }
  version: string
  championNames: Record<string, string>
}) {
  // La escala de la barra es el máximo de ESTA partida, como en la ficha.
  const maxDamage = Math.max(...jugadores.map((j) => j.damageToChampions), 0)

  return (
    <div className="flex flex-col gap-4 border-t-2 border-line px-4 py-4">
      <div className="grid gap-4 lg:grid-cols-2">
        {([100, 200] as const).map((side) => (
          <Lado
            key={side}
            side={side}
            nombre={nombres[side]}
            stats={equipos.get(side)}
            jugadores={jugadores.filter((j) => j.side === side)}
            maxDamage={maxDamage}
            version={version}
            championNames={names}
          />
        ))}
      </div>

      <Link
        href={`/partidas/${matchId}`}
        className="self-start text-xs font-bold uppercase tracking-wide text-muted transition-colors hover:text-accent"
      >
        Ficha completa →
      </Link>
    </div>
  )
}

/* Los tonos de cada lado, enteros: Tailwind no ve una clase armada en runtime. */
const LADO = {
  100: { texto: 'text-side-blue', borde: 'border-l-side-blue' },
  200: { texto: 'text-side-red', borde: 'border-l-side-red' },
} as const

function Lado({
  side,
  nombre,
  stats,
  jugadores,
  maxDamage,
  version,
  championNames: names,
}: {
  side: 100 | 200
  nombre: string
  stats: MatchTeamStatsRow | undefined
  jugadores: JugadorDetalle[]
  maxDamage: number
  version: string
  championNames: Record<string, string>
}) {
  const tono = LADO[side]

  return (
    <section className={`border-2 border-line border-l-4 ${tono.borde}`}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-surface px-3 py-2">
        <h3 className={`text-sm font-bold ${tono.texto}`}>{nombre}</h3>
        <span className={`text-xs ${stats?.win ? 'text-win' : 'text-loss'}`}>
          {stats?.win ? 'Victoria' : 'Derrota'}
        </span>

        <div className="tabular ml-auto flex flex-wrap gap-x-3 text-xs text-muted">
          <span>
            <strong className="text-fg">{stats?.turrets ?? 0}</strong> torres
          </span>
          <span>
            <strong className="text-fg">{stats?.dragons ?? 0}</strong> drag.
          </span>
          <span>
            <strong className="text-fg">{stats?.barons ?? 0}</strong> barones
          </span>
          <span className="hidden sm:inline">
            <strong className="text-fg">{stats?.heralds ?? 0}</strong> heraldos
          </span>
        </div>
      </header>

      <ul className="divide-y divide-line">
        {jugadores.map((jugador) => {
          const campeon = championName(names, jugador.champion)

          return (
            <li
              key={jugador.matchPlayerId}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm"
            >
              <GameIcon src={championIcon(version, jugador.champion)} alt={campeon} size={28} />

              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 truncate">
                  {jugador.isMvp && (
                    <span
                      title="MVP de la partida"
                      className="bg-accent-strong px-1 text-[10px] font-bold text-white"
                    >
                      MVP
                    </span>
                  )}
                  {jugador.playerId ? (
                    <Link
                      href={rutaJugador(jugador.playerId)}
                      className="truncate font-medium transition-colors hover:text-accent"
                    >
                      {playerName(jugador.riotGameName)}
                    </Link>
                  ) : (
                    <span className="truncate font-medium">
                      {playerName(jugador.riotGameName)}
                    </span>
                  )}
                  {riotTag(jugador.riotGameName, jugador.riotTagLine) && (
                    <span className="shrink-0 text-xs text-faint">
                      {riotTag(jugador.riotGameName, jugador.riotTagLine)}
                    </span>
                  )}
                </p>
                {/*
                  Sólo el campeón: la línea que juega cada uno ya la dice el
                  orden de la lista —top arriba, soporte abajo, igual en las dos
                  columnas—, así que repetirla en cada fila es decir dos veces lo
                  mismo y le saca lugar al nombre.
                */}
                <p className="truncate text-xs text-faint">{campeon}</p>
              </div>

              <div className="tabular w-16 shrink-0 text-right">
                <p>{formatKda(jugador.kills, jugador.deaths, jugador.assists)}</p>
                <p className="text-xs text-faint">
                  {Math.round(jugador.killParticipation * 100)}% KP
                </p>
              </div>

              <div className="tabular hidden w-16 shrink-0 text-right sm:block">
                <p>{jugador.cs} CS</p>
                <p className="text-xs text-faint">{formatGold(jugador.goldEarned)}</p>
              </div>

              <div className="hidden shrink-0 md:block">
                <BarraDeDano
                  damage={jugador.damageToChampions}
                  max={maxDamage}
                  side={side}
                  ancho="w-14"
                />
                <p className="tabular text-right text-xs text-faint">
                  {jugador.visionScore} visión
                </p>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
