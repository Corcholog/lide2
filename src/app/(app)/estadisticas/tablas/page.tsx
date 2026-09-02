import { getUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { rows } from '@/lib/supabase/query'
import { assetVersion, championName, championNames } from '@/lib/ddragon'
import { tournamentStartDate, TOURNAMENT } from '@/lib/lide2/tournament'
import { playerName } from '@/lib/format'
import { resolveTournamentId } from '@/lib/stats/query'
import { parseScope } from '@/lib/stats/scope'
import { metaFilter, parseGroup, scopeFilter } from '@/lib/stats/tables'
import { parseSortOrder } from '@/lib/table/sort'
import { Empty } from '@/components/stats/Empty'
import { GroupNav } from '@/components/stats/GroupNav'
import { ScopeNav } from '@/components/stats/ScopeNav'
import { ViewNav } from '@/components/stats/ViewNav'
import { ChampionTable, type ChampionRow } from '@/components/stats/ChampionTable'
import { TeamTable, type TeamRow } from '@/components/stats/TeamTable'
import { PlayerTable, type PlayerRow } from '@/components/stats/PlayerTable'
import type { ChampionMetaRow, PlayerPhaseTotalsRow, TeamPhaseTotalsRow } from '@/types/db'

export const metadata = {
  title: 'Tablas',
  description:
    'El meta, los jugadores y los equipos en tablas completas: pick rate, ban rate, presencia y winrate, con filtro por fecha y por grupo.',
}

export const dynamic = 'force-dynamic'

/**
 * The lookup tables.
 *
 * The other tab - the rankings - is a top five of everything, which is what
 * serves to tell the story of the tournament. This one is for searching: every
 * row, every column, sorted by whichever matters to you.
 *
 * THE NUMBERS ARE COERCED HERE, once. `pick_rate`, `win_pct`, `kda` and
 * `presence` are `numeric` in Postgres and can arrive as text; travelling that
 * way to the client component, sorting would compare "0.9" against "0.85" as
 * words and the table would come out wrong without throwing any error.
 *
 * The column ids stay in Spanish: they travel in `?orden=`.
 */

const CHAMPION_COLUMNS = ['campeon', 'posicion', 'picks', 'pickrate', 'winrate', 'kda', 'dano']

/**
 * The three columns that only exist once some draft is entered.
 *
 * They are kept apart so `parseSortOrder` does not accept `?orden=banrate` when
 * the column is not being drawn: the table would end up unsorted and with no
 * arrow marked, which looks like a broken link.
 */
const BAN_COLUMNS = ['bans', 'banrate', 'presencia']

const PLAYER_COLUMNS = [
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

const TEAM_COLUMNS = [
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

export default async function TablesPage({ searchParams }: PageProps<'/estadisticas/tablas'>) {
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
        detail={`La ${TOURNAMENT.name} arranca el ${tournamentStartDate()}. En cuanto se juegue la primera fecha, esta página se llena sola.`}
      />
    )
  }

  const params = await searchParams
  const scope = parseScope(params.fecha, tournamentId)
  const group = parseGroup(params.grupo)

  // The scope each nav carries along so it does not wipe the other's filter.
  const filters = { fecha: scope.matchday, grupo: group?.slice(-1) ?? null }

  const [metaRes, playersRes, teamsRes, version] = await Promise.all([
    supabase.from('champion_meta').select('*').match(metaFilter(scope, group)),
    supabase.from('player_phase_totals').select('*').match(scopeFilter(scope)),
    supabase.from('team_phase_totals').select('*').match(scopeFilter(scope)),
    assetVersion(null),
  ])

  const names = await championNames(version)

  const meta = rows<ChampionMetaRow>(metaRes, 'the champion meta')
  const teams = rows<TeamPhaseTotalsRow>(teamsRes, 'the teams')
  const players = rows<PlayerPhaseTotalsRow>(playersRes, 'the players')

  /*
    Players and teams do not have the group dimension in their views, and they
    do not need it: in the group phase a team only plays teams from its own
    group, so its totals ALREADY are that group's and it is enough not to draw
    the other teams. A player's group comes from their team's.
  */
  const groupOfTeam = new Map(teams.map((team) => [team.team_id, team.group_label]))
  const filteredTeams = group ? teams.filter((team) => team.group_label === group) : teams
  const filteredPlayers = group
    ? players.filter((p) => p.team_id !== null && groupOfTeam.get(p.team_id) === group)
    : players

  const matches = meta[0]?.matches ?? 0
  const withDraft = meta[0]?.matches_with_bans ?? 0

  const championRows: ChampionRow[] = meta.map((row) => ({
    champion: row.champion,
    name: championName(names, row.champion),
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

  const playerRows: PlayerRow[] = filteredPlayers
    .filter((row): row is PlayerPhaseTotalsRow & { player_id: string } => row.player_id !== null)
    .map((row) => ({
      playerId: row.player_id,
      name: playerName(row.player_name),
      teamId: row.team_id,
      teamName: row.team_name,
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

  const teamRows: TeamRow[] = filteredTeams.map((row) => ({
    teamId: row.team_id,
    name: row.team_name ?? 'Equipo',
    logo: row.team_logo,
    group: row.group_label,
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
          {group ?? 'Todos los grupos'} ·{' '}
          {scope.matchday === null ? 'toda la fase' : `fecha ${scope.matchday}`}
          {matches > 0 && ` · ${matches} ${matches === 1 ? 'partida' : 'partidas'}`}
        </p>
      </header>

      <div className="flex flex-col gap-2">
        {/* The other tab does not filter by group: it only gets the matchday. */}
        <ViewNav active="tablas" query={{ fecha: scope.matchday }} />
        <ScopeNav base="/estadisticas/tablas" matchday={scope.matchday} query={filters} />
        <GroupNav base="/estadisticas/tablas" group={group} query={filters} />
      </div>

      {matches === 0 ? (
        <Empty
          title="Todavía no se jugó nada acá"
          detail={
            group || scope.matchday !== null
              ? 'Probá con otro recorte: ninguna partida de este grupo y esta fecha tiene el replay cargado.'
              : `La ${TOURNAMENT.name} arranca el ${tournamentStartDate()}. En cuanto se suba el primer replay, esta página se llena sola.`
          }
        />
      ) : (
        <>
          <Section
            title="Campeones"
            detail={
              withDraft === 0
                ? 'Sin drafts cargados todavía: los baneos no salen del .rofl y se cargan a mano.'
                : withDraft < matches
                  ? `Baneos medidos sobre ${withDraft} de ${matches} partidas: al resto le falta el draft.`
                  : 'Elegidos, baneados y cómo les fue.'
            }
          >
            <ChampionTable
              rows={championRows}
              version={version}
              hasBans={withDraft > 0}
              initial={parseSortOrder(
                params.orden,
                params.dir,
                withDraft > 0 ? [...CHAMPION_COLUMNS, ...BAN_COLUMNS] : CHAMPION_COLUMNS,
                { id: 'pickrate', dir: 'desc' },
              )}
            />
          </Section>

          <Section title="Jugadores" detail="Los números de cada uno en este recorte.">
            <PlayerTable
              rows={playerRows}
              initial={parseSortOrder(
                params['orden-jugadores'],
                params['dir-jugadores'],
                PLAYER_COLUMNS,
                { id: 'mvp', dir: 'desc' },
              )}
            />
          </Section>

          <Section title="Equipos" detail="Para comparar, no para la tabla de posiciones.">
            <TeamTable
              rows={teamRows}
              initial={parseSortOrder(params['orden-equipos'], params['dir-equipos'], TEAM_COLUMNS, {
                id: 'winrate',
                dir: 'desc',
              })}
            />
          </Section>
        </>
      )}
    </div>
  )
}

function Section({
  title,
  detail,
  children,
}: {
  title: string
  detail: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-3 border-b-2 border-line-strong pb-2">
        <h2 className="font-display text-lg uppercase tracking-wide">{title}</h2>
        <p className="text-xs text-muted">{detail}</p>
      </div>
      {children}
    </section>
  )
}
