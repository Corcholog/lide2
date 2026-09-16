import { getUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { rows } from '@/lib/supabase/query'
import { assetVersion, championName, championNames } from '@/lib/ddragon'
import { tournamentStartDate, TOURNAMENT } from '@/lib/lide2/tournament'
import { playerName } from '@/lib/format'
import { resolveTournamentId } from '@/lib/stats/query'
import { parseScope } from '@/lib/stats/scope'
import {
  byRole,
  championsInRole,
  metaFilter,
  scopeCounts,
  parseGroup,
  parseRole,
} from '@/lib/stats/tables'
import { scopeFilter } from '@/lib/stats/filters'
import { parseSortOrder } from '@/lib/table/sort'
import { Empty } from '@/components/stats/Empty'
import { GroupNav } from '@/components/stats/GroupNav'
import { RoleNav } from '@/components/stats/RoleNav'
import { ScopeNav } from '@/components/stats/ScopeNav'
import { ViewNav } from '@/components/stats/ViewNav'
import { ChampionTable, type ChampionRow } from '@/components/stats/ChampionTable'
import { TeamTable, type TeamRow } from '@/components/stats/TeamTable'
import { PlayerTable, type PlayerRow } from '@/components/stats/PlayerTable'
import type { ChampionMetaRow, PlayerPhaseTotalsRow, TeamPhaseTotalsRow } from '@/types/db'

export const metadata = {
  title: 'Tablas',
  description:
    'El meta, los jugadores y los equipos en tablas completas: pick rate, ban rate, presencia y winrate, con filtro por fecha, por grupo y por rol.',
}

export const dynamic = 'force-dynamic'

/**
 * The lookup tables: every row and column, sortable, as opposed to the top
 * five rankings in the other tab.
 *
 * Numbers are coerced here once: `pick_rate`, `win_pct`, `kda` and `presence`
 * are `numeric` in Postgres and may arrive as text, which would make sorting
 * compare them as strings without any error.
 *
 * Column ids are Spanish because they travel in `?orden=`.
 */

const CHAMPION_COLUMNS = ['campeon', 'posicion', 'picks', 'pickrate', 'winrate', 'kda', 'dano']

/**
 * Columns that only exist once a draft has been entered. Kept separate so
 * `parseSortOrder` rejects `?orden=banrate` while the column is not drawn.
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
  const role = parseRole(params.rol)

  // The scope each nav carries along so it does not wipe the others' filters.
  const filters = {
    fecha: scope.matchday,
    grupo: group?.slice(-1) ?? null,
    rol: role?.id ?? null,
  }

  // Changing a filter remounts the tables, so a sort picked by clicking a
  // header does not outlive the URL that no longer carries it.
  const tableKey = [filters.fecha, filters.grupo, filters.rol].join(':')

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
    Player and team views have no group dimension. In the group phase a team
    only plays its own group, so its totals are already the group's: filtering
    rows is enough. A player's group is their team's.
  */
  const groupOfTeam = new Map(teams.map((team) => [team.team_id, team.group_label]))
  const filteredTeams = group ? teams.filter((team) => team.group_label === group) : teams
  const filteredPlayers = group
    ? players.filter((p) => p.team_id !== null && groupOfTeam.get(p.team_id) === group)
    : players

  /*
    Match counts come from a whole-champion row: they describe the scope, and a
    role nobody played would otherwise read as zero matches.
  */
  const { matches, withDraft } = scopeCounts(meta)

  /*
    Bans have no role (a champion is banned, not a lane), so the view leaves
    them empty on role rows and the table hides those columns.
  */
  const showBans = withDraft > 0 && role === null

  const championRows: ChampionRow[] = championsInRole(meta, role).map((row) => ({
    champion: row.champion,
    name: championName(names, row.champion),
    position: row.position,
    // `?? []` keeps the table working if the code deploys before migration
    // 0029 adds the column; the view itself never returns null here.
    positions: row.positions ?? [],
    picks: Number(row.picks),
    wins: Number(row.wins),
    losses: Number(row.losses),
    winPct: row.win_pct === null ? null : Number(row.win_pct),
    pickRate: row.pick_rate === null ? null : Number(row.pick_rate),
    bans: row.bans === null ? null : Number(row.bans),
    banRate: row.ban_rate === null ? null : Number(row.ban_rate),
    presence: row.presence === null ? null : Number(row.presence),
    kda: Number(row.avg_kda),
    kills: Number(row.kills),
    deaths: Number(row.deaths),
    assists: Number(row.assists),
    dpm: Number(row.dpm),
  }))

  const playerRows: PlayerRow[] = byRole(filteredPlayers, role)
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
          {group ?? 'Todos los grupos'} · {role?.label ?? 'todos los roles'} ·{' '}
          {scope.matchday === null ? 'toda la fase' : `fecha ${scope.matchday}`}
          {matches > 0 && ` · ${matches} ${matches === 1 ? 'partida' : 'partidas'}`}
        </p>
      </header>

      <div className="flex flex-col gap-2">
        {/* The other tab does not filter by group: it only gets the matchday. */}
        <ViewNav active="tablas" query={{ fecha: scope.matchday }} />
        <ScopeNav base="/estadisticas/tablas" matchday={scope.matchday} query={filters} />
        <GroupNav base="/estadisticas/tablas" group={group} query={filters} />
        <RoleNav base="/estadisticas/tablas" role={role} query={filters} />
      </div>

      {matches === 0 ? (
        <Empty
          title="Todavía no se jugó nada acá"
          detail={
            // The role does not change `matches`, so it cannot make a scope empty.
            group || scope.matchday !== null
              ? 'Probá con otro recorte: ninguna partida de este grupo y esta fecha tiene el replay cargado.'
              : `La ${TOURNAMENT.name} arranca el ${tournamentStartDate()}. En cuanto se suba el primer replay, esta página se llena sola.`
          }
        />
      ) : (
        <>
          <Section
            title="Campeones"
            /*
              Says what the averages are over: the champion's picks, whose count
              is the adjacent column.
            */
            detail={[
              'El KDA y el daño son promedios de las partidas en las que se jugó cada campeón (picks).',
              /*
                With a role selected, each row is the champion's picks in that
                role only; say so, since the same champion shows different
                numbers per role.
              */
              role
                ? `Filtrado por ${role.label}: cada campeón muestra los números de sus picks en esa línea, no los de todos.`
                : null,
              role !== null
                ? null
                : withDraft === 0
                  ? 'Los baneos no salen del .rofl y todavía no se cargó ningún draft.'
                  : withDraft < matches
                    ? `Baneos medidos sobre ${withDraft} de ${matches} partidas: al resto le falta el draft.`
                    : null,
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <ChampionTable
              key={tableKey}
              rows={championRows}
              version={version}
              hasBans={showBans}
              initial={parseSortOrder(
                params.orden,
                params.dir,
                showBans ? [...CHAMPION_COLUMNS, ...BAN_COLUMNS] : CHAMPION_COLUMNS,
                { id: 'pickrate', dir: 'desc' },
              )}
            />
          </Section>

          <Section
            title="Jugadores"
            detail={
              role
                ? 'Los números de cada uno en este recorte. El rol es el que más veces jugó: si llenó en otra línea, esas partidas están adentro de sus promedios.'
                : 'Los números de cada uno en este recorte.'
            }
          >
            <PlayerTable
              key={tableKey}
              rows={playerRows}
              initial={parseSortOrder(
                params['orden-jugadores'],
                params['dir-jugadores'],
                PLAYER_COLUMNS,
                { id: 'mvp', dir: 'desc' },
              )}
            />
          </Section>

          {/*
            The teams table ignores the role, because a team does not have one.
            Hiding the section while a role is picked would be worse: the page
            would appear to have lost a table. It stays whole and says why.
          */}
          <Section
            title="Equipos"
            detail={
              role
                ? 'Para comparar, no para la tabla de posiciones. El filtro por rol no las recorta: un equipo no tiene rol.'
                : 'Para comparar, no para la tabla de posiciones.'
            }
          >
            <TeamTable
              key={tableKey}
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
