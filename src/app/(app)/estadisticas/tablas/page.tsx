import { getUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { rows } from '@/lib/supabase/query'
import { assetVersion, championName, championNames } from '@/lib/ddragon'
import { inicioDelTorneo, TOURNAMENT } from '@/lib/lide2/tournament'
import { playerName } from '@/lib/format'
import { resolveTournamentId } from '@/lib/stats/query'
import { parseScope } from '@/lib/stats/scope'
import { metaFilter, parseGrupo, scopeFilter } from '@/lib/stats/tablas'
import { parseOrden } from '@/lib/tabla/orden'
import { Empty } from '@/components/estadisticas/Empty'
import { GrupoNav } from '@/components/estadisticas/GrupoNav'
import { ScopeNav } from '@/components/estadisticas/ScopeNav'
import { VistaNav } from '@/components/estadisticas/VistaNav'
import { TablaCampeones, type FilaCampeon } from '@/components/estadisticas/TablaCampeones'
import { TablaEquipos, type FilaEquipo } from '@/components/estadisticas/TablaEquipos'
import { TablaJugadores, type FilaJugador } from '@/components/estadisticas/TablaJugadores'
import type { ChampionMetaRow, PlayerPhaseTotalsRow, TeamPhaseTotalsRow } from '@/types/db'

export const metadata = {
  title: 'Tablas',
  description:
    'El meta, los jugadores y los equipos en tablas completas: pick rate, ban rate, presencia y winrate, con filtro por fecha y por grupo.',
}

export const dynamic = 'force-dynamic'

/**
 * Las tablas de consulta.
 *
 * La otra pestaña —los rankings— es un top cinco de cada cosa, que es lo que
 * sirve para contar el torneo. Esta es para buscar: todas las filas, todas las
 * columnas, y ordenar por la que a uno le importe.
 *
 * LOS NUMEROS SE COERCIONAN ACA, una sola vez. `pick_rate`, `win_pct`, `kda` y
 * `presence` son `numeric` en Postgres y pueden llegar como texto; si viajaran
 * así al componente de cliente, ordenar compararía "0.9" contra "0.85" como
 * palabras y la tabla saldría mal sin tirar ningún error.
 */

const ORDEN_CAMPEONES = ['campeon', 'posicion', 'picks', 'pickrate', 'winrate', 'kda', 'dano']

/**
 * Las tres columnas que sólo existen cuando hay algún draft cargado.
 *
 * Van aparte para que `parseOrden` no acepte `?orden=banrate` cuando la columna
 * no se está dibujando: la tabla quedaría sin ordenar y sin ninguna flecha
 * marcada, que se ve como si el link estuviera roto.
 */
const ORDEN_BANS = ['bans', 'banrate', 'presencia']

const ORDEN_JUGADORES = [
  'jugador',
  'equipo',
  'posicion',
  'partidas',
  'victorias',
  'kda',
  'kp',
  'dano',
  'dpm',
  'csm',
  'gpm',
  'vision',
  'mvp',
] as const

const ORDEN_EQUIPOS = [
  'equipo',
  'grupo',
  'partidas',
  'victorias',
  'winrate',
  'kills',
  'killdiff',
  'golddiff',
  'objetivos',
  'duracion',
] as const

export default async function TablasPage({ searchParams }: PageProps<'/estadisticas/tablas'>) {
  const supabase = await createClient()
  const [user, tournamentId] = await Promise.all([getUser(), resolveTournamentId(supabase)])

  if (!tournamentId) {
    return user ? (
      <Empty
        title="Todavía no hay torneo cargado"
        detail={`Corré \`npm run seed:lide2\` para crear la ${TOURNAMENT.name} en la base.`}
      />
    ) : (
      <Empty
        title="Todavía no hay estadísticas"
        detail={`La ${TOURNAMENT.name} arranca el ${inicioDelTorneo()}. En cuanto se juegue la primera fecha, esta página se llena sola.`}
      />
    )
  }

  const params = await searchParams
  const scope = parseScope(params.fecha, tournamentId)
  const grupo = parseGrupo(params.grupo)

  // El recorte que arrastra cada nav para no borrar el filtro del otro.
  const filtros = { fecha: scope.matchday, grupo: grupo?.slice(-1) ?? null }

  const [metaRes, jugadoresRes, equiposRes, version] = await Promise.all([
    supabase.from('champion_meta').select('*').match(metaFilter(scope, grupo)),
    supabase.from('player_phase_totals').select('*').match(scopeFilter(scope)),
    supabase.from('team_phase_totals').select('*').match(scopeFilter(scope)),
    assetVersion(null),
  ])

  const names = await championNames(version)

  const meta = rows<ChampionMetaRow>(metaRes, 'el meta de campeones')
  const equipos = rows<TeamPhaseTotalsRow>(equiposRes, 'los equipos')
  const jugadores = rows<PlayerPhaseTotalsRow>(jugadoresRes, 'los jugadores')

  /*
    Jugadores y equipos no tienen la dimensión de grupo en sus vistas, y no
    hace falta que la tengan: en fase de grupos un equipo sólo juega contra los
    de su grupo, así que sus totales YA son los de ese grupo y alcanza con no
    dibujar los otros equipos. El grupo del jugador sale del suyo.
  */
  const grupoDelEquipo = new Map(equipos.map((e) => [e.team_id, e.group_label]))
  const equiposFiltrados = grupo ? equipos.filter((e) => e.group_label === grupo) : equipos
  const jugadoresFiltrados = grupo
    ? jugadores.filter((j) => j.team_id !== null && grupoDelEquipo.get(j.team_id) === grupo)
    : jugadores

  const partidas = meta[0]?.matches ?? 0
  const conDraft = meta[0]?.matches_with_bans ?? 0

  const filasCampeones: FilaCampeon[] = meta.map((row) => ({
    champion: row.champion,
    nombre: championName(names, row.champion),
    position: row.position,
    picks: Number(row.picks),
    wins: Number(row.wins),
    losses: Number(row.losses),
    winPct: row.win_pct === null ? null : Number(row.win_pct),
    pickRate: row.pick_rate === null ? null : Number(row.pick_rate),
    bans: Number(row.bans),
    banRate: row.ban_rate === null ? null : Number(row.ban_rate),
    presence: row.presence === null ? null : Number(row.presence),
    kda: Number(row.kda),
    kills: Number(row.kills),
    deaths: Number(row.deaths),
    assists: Number(row.assists),
    avgDamage: Number(row.avg_damage),
  }))

  const filasJugadores: FilaJugador[] = jugadoresFiltrados
    .filter((row): row is PlayerPhaseTotalsRow & { player_id: string } => row.player_id !== null)
    .map((row) => ({
      playerId: row.player_id,
      nombre: playerName(row.player_name),
      teamId: row.team_id,
      equipo: row.team_name,
      position: row.position,
      games: Number(row.games),
      wins: Number(row.wins),
      losses: Number(row.losses),
      kda: Number(row.kda),
      avgKills: Number(row.avg_kills),
      avgDeaths: Number(row.avg_deaths),
      avgAssists: Number(row.avg_assists),
      killParticipation: Number(row.kill_participation),
      avgDamage: Number(row.avg_damage),
      dpm: Number(row.dpm),
      csm: Number(row.csm),
      gpm: Number(row.gpm),
      avgVision: Number(row.avg_vision),
      mvpCount: Number(row.mvp_count),
    }))

  const filasEquipos: FilaEquipo[] = equiposFiltrados.map((row) => ({
    teamId: row.team_id,
    nombre: row.team_name ?? 'Equipo',
    logo: row.team_logo,
    grupo: row.group_label,
    games: Number(row.games),
    wins: Number(row.wins),
    losses: Number(row.losses),
    winPct: Number(row.win_pct),
    kills: Number(row.kills),
    killDiff: Number(row.kill_diff),
    goldDiff: Number(row.gold_diff),
    objectives: Number(row.objectives),
    avgMinutes: Number(row.avg_minutes),
  }))

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl uppercase tracking-tight">Estadísticas</h1>
        <p className="text-sm text-muted">
          {grupo ?? 'Todos los grupos'} ·{' '}
          {scope.matchday === null ? 'toda la fase' : `fecha ${scope.matchday}`}
          {partidas > 0 && ` · ${partidas} ${partidas === 1 ? 'partida' : 'partidas'}`}
        </p>
      </header>

      <div className="flex flex-col gap-2">
        {/* La otra pestaña no filtra por grupo: sólo se le pasa la fecha. */}
        <VistaNav activa="tablas" query={{ fecha: scope.matchday }} />
        <ScopeNav base="/estadisticas/tablas" matchday={scope.matchday} query={filtros} />
        <GrupoNav base="/estadisticas/tablas" grupo={grupo} query={filtros} />
      </div>

      {partidas === 0 ? (
        <Empty
          title="Todavía no se jugó nada acá"
          detail={
            grupo || scope.matchday !== null
              ? 'Probá con otro recorte: ninguna partida de este grupo y esta fecha tiene el replay cargado.'
              : `La ${TOURNAMENT.name} arranca el ${inicioDelTorneo()}. En cuanto se suba el primer replay, esta página se llena sola.`
          }
        />
      ) : (
        <>
          <Seccion
            titulo="Campeones"
            detalle={
              conDraft === 0
                ? 'Sin drafts cargados todavía: los baneos no salen del .rofl y se cargan a mano.'
                : conDraft < partidas
                  ? `Baneos medidos sobre ${conDraft} de ${partidas} partidas: al resto le falta el draft.`
                  : 'Elegidos, baneados y cómo les fue.'
            }
          >
            <TablaCampeones
              filas={filasCampeones}
              version={version}
              conBans={conDraft > 0}
              inicial={parseOrden(
                params.orden,
                params.dir,
                conDraft > 0 ? [...ORDEN_CAMPEONES, ...ORDEN_BANS] : ORDEN_CAMPEONES,
                { id: 'pickrate', dir: 'desc' },
              )}
            />
          </Seccion>

          <Seccion titulo="Jugadores" detalle="Los números de cada uno en este recorte.">
            <TablaJugadores
              filas={filasJugadores}
              inicial={parseOrden(
                params['orden-jugadores'],
                params['dir-jugadores'],
                ORDEN_JUGADORES,
                { id: 'mvp', dir: 'desc' },
              )}
            />
          </Seccion>

          <Seccion titulo="Equipos" detalle="Para comparar, no para la tabla de posiciones.">
            <TablaEquipos
              filas={filasEquipos}
              inicial={parseOrden(params['orden-equipos'], params['dir-equipos'], ORDEN_EQUIPOS, {
                id: 'winrate',
                dir: 'desc',
              })}
            />
          </Seccion>
        </>
      )}
    </div>
  )
}

function Seccion({
  titulo,
  detalle,
  children,
}: {
  titulo: string
  detalle: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-3 border-b-2 border-line-strong pb-2">
        <h2 className="font-display text-lg uppercase tracking-wide">{titulo}</h2>
        <p className="text-xs text-muted">{detalle}</p>
      </div>
      {children}
    </section>
  )
}
