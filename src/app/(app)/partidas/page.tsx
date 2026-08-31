import Link from 'next/link'
import { getUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { rows } from '@/lib/supabase/query'
import { assetVersion, championIcon, championName, championNames } from '@/lib/ddragon'
import { formatDate, formatDuration, formatKda, ROLES } from '@/lib/format'
import { inicioDelTorneo, TOURNAMENT } from '@/lib/lide2/tournament'
import { parseEquipo } from '@/lib/partidas/filtros'
import { resolveTournamentId } from '@/lib/stats/query'
import { parseScope } from '@/lib/stats/scope'
import { ScopeNav } from '@/components/estadisticas/ScopeNav'
import { GameIcon } from '@/components/match/GameIcon'
import { DetallePartida, type JugadorDetalle } from '@/components/partidas/DetallePartida'
import { FiltroEquipo } from '@/components/partidas/FiltroEquipo'
import type { MatchPlayerScoreRow, MatchSummaryRow, MatchTeamStatsRow } from '@/types/db'

export const metadata = {
  title: 'Partidas',
  description: 'Todas las partidas jugadas, con su marcador, su duración y su MVP.',
}

export const dynamic = 'force-dynamic'

/**
 * El historial del torneo.
 *
 * Cada partida es una fila que se despliega: adentro está el scoreboard
 * resumido de los dos equipos. Antes había que entrar a la ficha para ver
 * cualquier cosa, y revisar una fecha entera eran diez idas y vueltas.
 *
 * EL DESPLEGABLE ES `<details>` NATIVO y no una isla de cliente: no necesita
 * JavaScript, el navegador ya le da el `aria-expanded`, el toggle con Enter y
 * el foco donde va, y además no dibuja el contenido mientras está cerrado. Es
 * la misma razón por la que los filtros son links y no estado de React.
 *
 * EL DETALLE VIENE PRECARGADO. El torneo entero son unas sesenta partidas, o
 * sea seiscientas filas de `match_player_scores`: traerlas de una sale más
 * barato que un endpoint aparte con su estado de carga. Se piden las columnas
 * necesarias y no `*` —items y hechizos son siete íconos por jugador que acá no
 * se miran— y se recorta a las partidas ya filtradas. Si alguna vez el listado
 * pasara de unas 150 visibles a la vez, ahí sí conviene un handler que devuelva
 * el detalle de una partida a pedido.
 */

/**
 * Las columnas del scoreboard que usa el detalle. Sin items ni hechizos.
 *
 * Va en una sola línea y no partida con `+`: supabase-js le mira el TIPO a esta
 * cadena para saber qué devuelve la consulta, y una concatenación deja de ser
 * un literal y pasa a ser `string`, con lo que el resultado se vuelve
 * inutilizable (`GenericStringError`).
 */
const COLUMNAS_DETALLE =
  'match_player_id,match_id,side,player_id,champion,position,riot_game_name,riot_tag_line,kills,deaths,assists,cs,csm,gold_earned,damage_to_champions,vision_score,kill_participation,match_rank'

type ScoreDetalle = Pick<
  MatchPlayerScoreRow,
  | 'match_player_id'
  | 'match_id'
  | 'side'
  | 'player_id'
  | 'champion'
  | 'position'
  | 'riot_game_name'
  | 'riot_tag_line'
  | 'kills'
  | 'deaths'
  | 'assists'
  | 'cs'
  | 'csm'
  | 'gold_earned'
  | 'damage_to_champions'
  | 'vision_score'
  | 'kill_participation'
  | 'match_rank'
>

export default async function MatchesPage({ searchParams }: PageProps<'/partidas'>) {
  // La lista se ve sin sesión; subir replays, no.
  const user = await getUser()
  const supabase = await createClient()
  const tournamentId = await resolveTournamentId(supabase)

  const params = await searchParams

  /*
   * Sólo las partidas del torneo.
   *
   * Sin el filtro esta lista mostraba `match_summaries` entera, o sea todo
   * .rofl que alguna vez se haya subido: los de prueba, los de otro torneo y
   * los que están esperando que alguien los asigne a su cruce. Nada de eso es
   * la LIDE 2, y en una página pública se lee como si lo fuera.
   *
   * Las que todavía no tienen cruce se ven en /admin/asignar, que es donde
   * hace falta verlas.
   */
  const equipos = tournamentId
    ? rows<{ id: string; name: string; group_label: string | null }>(
        await supabase
          .from('teams')
          .select('id,name,group_label')
          .eq('tournament_id', tournamentId)
          .order('name'),
        'los equipos',
      )
    : []

  const scope = parseScope(params.fecha, tournamentId ?? '')
  const equipo = parseEquipo(
    params.equipo,
    equipos.map((e) => e.id),
  )
  const filtrando = scope.matchday !== null || equipo !== null

  let consulta = supabase
    .from('match_summaries')
    .select('*')
    .eq('tournament_id', tournamentId ?? '')
    .order('played_at', { ascending: false, nullsFirst: false })
    .limit(100)

  // `matchday` sale de match_summaries desde 0021: sin esa columna había que
  // pedirle antes a match_context los ids de la fecha y filtrar con un `in`.
  if (scope.matchday !== null) consulta = consulta.eq('matchday', scope.matchday)
  if (equipo) consulta = consulta.or(`blue_team_id.eq.${equipo},red_team_id.eq.${equipo}`)

  const matches = tournamentId ? rows<MatchSummaryRow>(await consulta, 'las partidas') : []
  const ids = matches.map((match) => match.id)

  const [scoresRes, statsRes] = await Promise.all([
    ids.length > 0
      ? supabase.from('match_player_scores').select(COLUMNAS_DETALLE).in('match_id', ids)
      : Promise.resolve({ data: [], error: null }),
    ids.length > 0
      ? supabase.from('match_team_stats').select('*').in('match_id', ids)
      : Promise.resolve({ data: [], error: null }),
  ])

  const scores = rows<ScoreDetalle>(scoresRes, 'el detalle de las partidas')
  const teamStats = rows<MatchTeamStatsRow>(statsRes, 'los totales por equipo')

  const jugadoresPorPartida = new Map<string, JugadorDetalle[]>()
  for (const score of scores) {
    const lista = jugadoresPorPartida.get(score.match_id) ?? []
    lista.push({
      matchPlayerId: score.match_player_id,
      side: score.side,
      playerId: score.player_id,
      champion: score.champion,
      position: score.position,
      riotGameName: score.riot_game_name,
      riotTagLine: score.riot_tag_line,
      kills: score.kills,
      deaths: score.deaths,
      assists: score.assists,
      killParticipation: Number(score.kill_participation),
      cs: score.cs,
      csm: Number(score.csm),
      goldEarned: score.gold_earned,
      damageToChampions: score.damage_to_champions,
      visionScore: score.vision_score,
      isMvp: score.match_rank === 1,
    })
    jugadoresPorPartida.set(score.match_id, lista)
  }

  /*
   * Cada equipo, en orden de línea: top, jungla, mid, ADC, soporte.
   *
   * `match_player_scores` los devuelve en el orden en que los escribió el
   * .rofl, que es el de los slots del lobby y no significa nada. Un scoreboard
   * se lee por línea —quién ganó el mid, cómo salió el botlane— y para eso las
   * dos columnas tienen que estar en el mismo orden; si no, comparar rivales es
   * ir y venir con el ojo.
   *
   * Se ordena una vez acá y no en cada componente porque lo usan los dos: la
   * fila cerrada, para los íconos de campeón, y el detalle desplegado.
   */
  const ordenDeLinea = (posicion: string | null) => {
    const index = ROLES.indexOf((posicion ?? '') as (typeof ROLES)[number])
    // Sin posición al final: el .rofl no siempre la trae.
    return index === -1 ? ROLES.length : index
  }

  for (const lista of jugadoresPorPartida.values()) {
    lista.sort(
      (a, b) => a.side - b.side || ordenDeLinea(a.position) - ordenDeLinea(b.position),
    )
  }

  const statsPorPartida = new Map<string, Map<100 | 200, MatchTeamStatsRow>>()
  for (const fila of teamStats) {
    const lados = statsPorPartida.get(fila.match_id) ?? new Map<100 | 200, MatchTeamStatsRow>()
    lados.set(fila.side, fila)
    statsPorPartida.set(fila.match_id, lados)
  }

  // El listado cruza parches, pero los nombres de los campeones no cambian de
  // uno a otro: alcanza con el catálogo del último.
  const version = await assetVersion(null)
  const champNames = await championNames(version)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Partidas</h1>
          <p className="mt-1 text-sm text-muted">
            {matches.length === 0
              ? 'Todavía no hay partidas cargadas.'
              : `${matches.length} partida${matches.length === 1 ? '' : 's'}${
                  filtrando ? ' en este recorte' : ' cargadas'
                }.`}
          </p>
        </div>
        {user && (
          <Link
            href="/admin/upload"
            className="rounded bg-accent-strong px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent"
          >
            Subir replays
          </Link>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <ScopeNav base="/partidas" matchday={scope.matchday} query={{ equipo }} />
        {equipos.length > 0 && (
          <FiltroEquipo equipos={equipos} equipo={equipo} fecha={scope.matchday} />
        )}
      </div>

      {matches.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line-strong px-6 py-14 text-center">
          {/*
            Tres textos porque son tres situaciones distintas. Con un filtro
            puesto lo que falta no es que se juegue nada: es aflojar el filtro.
            Sin filtro y con sesión esto es una pantalla de trabajo y lo que
            falta es subir los archivos. Sin sesión es alguien que entró a ver
            el torneo: pedirle que suba un .rofl es pedirle algo que no puede
            hacer, con una palabra que capaz ni conoce.
          */}
          <p className="text-fg-soft">
            {filtrando
              ? 'Ninguna partida de este recorte. Probá con otra fecha u otro equipo.'
              : user
                ? 'Subí los .rofl de las partidas jugadas para empezar.'
                : `Todavía no se jugó ninguna partida. La ${TOURNAMENT.name} arranca el ${inicioDelTorneo()}.`}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {matches.map((match) => (
            <li key={match.id}>
              <details className="group rounded-lg border border-line bg-surface open:border-line-strong">
                <summary className="flex cursor-pointer list-none items-center gap-4 px-4 py-3 [&::-webkit-details-marker]:hidden">
                  <div className="w-28 shrink-0 text-xs text-faint">
                    <p className="tabular">{formatDate(match.played_at)}</p>
                    <p>
                      {[match.group_label, match.matchday && `Fecha ${match.matchday}`]
                        .filter(Boolean)
                        .join(' · ') ||
                        [match.stage_label, match.round_label].filter(Boolean).join(' · ') ||
                        `parche ${match.patch ?? '?'}`}
                    </p>
                  </div>

                  {/*
                    Nombre, campeones, marcador, campeones, nombre.

                    Los dos equipos quedan en los extremos y los diez campeones
                    contra el marcador, que es el orden en que se lee: quién
                    contra quién, con qué. Puestos debajo del nombre tenían que
                    entrar en la mitad del ancho de la fila y no pasaban de
                    veinte píxeles, que para un retrato de campeón es una mancha.

                    En pantallas chicas los campeones no van: cinco de 32px por
                    lado no entran al lado de los nombres, y lo que no puede
                    achicarse más sin dejar de leerse es el marcador.
                  */}
                  <div className="flex flex-1 items-center justify-center gap-3">
                    <SideName
                      name={match.blue_team_name}
                      fallback="Lado azul"
                      won={match.winning_side === 100}
                      align="right"
                      accent="aqua"
                    />
                    <Campeones
                      jugadores={jugadoresPorPartida.get(match.id) ?? []}
                      side={100}
                      version={version}
                      championNames={champNames}
                    />
                    <div className="tabular shrink-0 text-center">
                      <p className="text-lg font-bold">
                        <span
                          className={match.winning_side === 100 ? 'text-side-blue' : 'text-muted'}
                        >
                          {match.blue_kills ?? 0}
                        </span>
                        <span className="mx-1 text-dim">–</span>
                        <span
                          className={match.winning_side === 200 ? 'text-side-red' : 'text-muted'}
                        >
                          {match.red_kills ?? 0}
                        </span>
                      </p>
                      <p className="text-xs text-faint">{formatDuration(match.game_length_ms)}</p>
                    </div>
                    <Campeones
                      jugadores={jugadoresPorPartida.get(match.id) ?? []}
                      side={200}
                      version={version}
                      championNames={champNames}
                    />
                    <SideName
                      name={match.red_team_name}
                      fallback="Lado rojo"
                      won={match.winning_side === 200}
                      align="left"
                      accent="red"
                    />
                  </div>

                  <div className="hidden w-52 shrink-0 text-right text-xs md:block">
                    {match.mvp_champion ? (
                      <>
                        <p className="text-fg-soft">
                          <span className="text-faint">MVP </span>
                          {match.mvp_name ?? championName(champNames, match.mvp_champion)}
                        </p>
                        <p className="tabular text-faint">
                          {championName(champNames, match.mvp_champion)} ·{' '}
                          {formatKda(
                            match.mvp_kills ?? 0,
                            match.mvp_deaths ?? 0,
                            match.mvp_assists ?? 0,
                          )}
                        </p>
                      </>
                    ) : (
                      <p className="text-dim">sin MVP</p>
                    )}
                  </div>


                  <svg
                    viewBox="0 0 12 12"
                    aria-hidden="true"
                    className="h-3 w-3 shrink-0 text-faint transition-transform group-open:rotate-90"
                  >
                    <path d="M4 2l5 4-5 4V2z" fill="currentColor" />
                  </svg>
                </summary>

                <DetallePartida
                  matchId={match.id}
                  jugadores={jugadoresPorPartida.get(match.id) ?? []}
                  equipos={statsPorPartida.get(match.id) ?? new Map()}
                  nombres={{
                    100: match.blue_team_name ?? 'Lado azul',
                    200: match.red_team_name ?? 'Lado rojo',
                  }}
                  version={version}
                  championNames={champNames}
                />
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Los cinco campeones de un lado, en orden de línea.
 *
 * Van sin nombre —son 20px, el nombre no entra— pero con `alt`, así que un
 * lector de pantalla lee la composición igual y el `title` la muestra al pasar
 * el mouse. Si una partida no tiene el scoreboard cargado no se dibuja nada, en
 * vez de cinco huecos grises.
 */
function Campeones({
  jugadores,
  side,
  version,
  championNames: names,
}: {
  jugadores: JugadorDetalle[]
  side: 100 | 200
  version: string
  championNames: Record<string, string>
}) {
  const delLado = jugadores.filter((jugador) => jugador.side === side)
  if (delLado.length === 0) return null

  return (
    <div className="hidden shrink-0 gap-0.5 md:flex">
      {delLado.map((jugador) => {
        const campeon = championName(names, jugador.champion)
        return (
          <GameIcon
            key={jugador.matchPlayerId}
            src={championIcon(version, jugador.champion)}
            alt={campeon}
            size={32}
          />
        )
      })}
    </div>
  )
}

function SideName({
  name,
  fallback,
  won,
  align,
  accent,
}: {
  name: string | null
  fallback: string
  won: boolean
  align: 'left' | 'right'
  accent: 'aqua' | 'red'
}) {
  const color = won ? (accent === 'aqua' ? 'text-side-blue' : 'text-side-red') : 'text-fg-soft'

  return (
    <p
      className={`min-w-0 flex-1 truncate text-sm font-medium ${color} ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      {name ?? <span className="text-dim">{fallback}</span>}
    </p>
  )
}
