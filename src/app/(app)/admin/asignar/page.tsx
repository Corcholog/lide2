import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { rows } from '@/lib/supabase/query'
import { assetVersion, championName, championNames } from '@/lib/ddragon'
import { formatDate } from '@/lib/format'
import { TOURNAMENT } from '@/lib/lide2/tournament'
import {
  AssignMatch,
  type FixtureOption,
  type SidePlayer,
  type UnassignedMatch,
} from '@/components/admin/AssignMatch'
import { Walkover } from '@/components/admin/Walkover'
import type { FixtureResultRow } from '@/types/db'

export const dynamic = 'force-dynamic'

interface UnassignedRow {
  match_id: string
  played_at: string | null
  game_length_ms: number
  patch: string | null
  winning_side: 100 | 200 | null
  blue_guess: string | null
  red_guess: string | null
  blue_players: UnassignedMatch['bluePlayers'] | null
  red_players: UnassignedMatch['redPlayers'] | null
  file_count: number
}

/**
 * The match-day panel.
 *
 * The .rofl gets uploaded, its matchup gets named, and with that the database
 * works out everything else: which teams played, which matchday it belongs to,
 * and - the first time - which Riot account belongs to which team. See
 * `supabase/migrations/0011_asignacion.sql` for why the order is that one and
 * not the reverse.
 */
export default async function AssignMatchesPage() {
  await requireUser()

  const supabase = await createClient()
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('id')
    .eq('slug', TOURNAMENT.slug)
    .maybeSingle()

  const tournamentId = (tournament?.id as string) ?? null

  const [pendingRes, fixtureRes, reviewRes] = await Promise.all([
    supabase.from('unassigned_matches').select('*').order('played_at', { ascending: true }),
    tournamentId
      ? supabase
          .from('fixture_results')
          .select('*')
          .eq('tournament_id', tournamentId)
          .order('matchday')
          .order('slot')
          .order('group_label')
          .order('team_a_name')
      : Promise.resolve({ data: [], error: null }),
    // Lo que dejaron las fechas ya cargadas por revisar, para todos los equipos
    // de una. Aca solo se cuenta y se dice donde: lo que hay que decidir sobre
    // cada cuenta necesita el plantel al lado, y eso esta en la ficha.
    supabase.from('roster_review').select('team_id,team_name,kind'),
  ])

  // Unassigned replays may come from different patches, but champion names do
  // not change between them: the latest catalogue is enough. A team is
  // recognized here by looking at the scoreboard, so it had better say the same
  // thing as the rest of the site and not the .rofl's internal key.
  const champNames = await championNames(await assetVersion(null))
  const named = (players: SidePlayer[]): SidePlayer[] =>
    players.map((player) => ({ ...player, champion: championName(champNames, player.champion) }))

  const matches = rows<UnassignedRow>(pendingRes, 'the unassigned matches').map(
    (row): UnassignedMatch => ({
      matchId: row.match_id,
      playedAt: row.played_at,
      gameLengthMs: row.game_length_ms,
      patch: row.patch,
      winningSide: row.winning_side,
      bluePlayers: named(row.blue_players ?? []),
      redPlayers: named(row.red_players ?? []),
      blueGuess: row.blue_guess,
      redGuess: row.red_guess,
    }),
  )

  const review = rows<{ team_id: string; team_name: string; kind: string }>(
    reviewRes as never,
    'the roster review',
  )
  // Por equipo y ordenados por cuanto tienen pendiente: el que mas cosas dejo
  // sin cerrar es por el que conviene empezar.
  const porEquipo = new Map<string, { id: string; name: string; n: number }>()
  for (const row of review) {
    const previo = porEquipo.get(row.team_id)
    porEquipo.set(row.team_id, {
      id: row.team_id,
      name: row.team_name,
      n: (previo?.n ?? 0) + 1,
    })
  }
  const conNovedades = [...porEquipo.values()].sort((a, b) => b.n - a.n)

  const fixture = rows<FixtureResultRow>(fixtureRes, 'the fixture')
  const done = fixture.filter((row) => row.match_id !== null)
  // Awarded without being played: they have no match and never will, so they
  // are neither "to be played" nor a replay waiting to be hooked up.
  const walkovers = fixture.filter((row) => row.walkover_team_id !== null)
  const pending = fixture.filter((row) => row.match_id === null && row.walkover_team_id === null)

  const options: FixtureOption[] = pending.map((row) => ({
    id: row.id,
    label: `Fecha ${row.matchday} · Turno ${row.slot} · ${row.group_label}`,
    teamA: { id: row.team_a_id, name: label(row.team_a_name, row.team_a_universities) },
    teamB: { id: row.team_b_id, name: label(row.team_b_name, row.team_b_universities) },
  }))

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl uppercase tracking-tight">Asignar partidas</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Decile a cada replay de qué cruce es. Con eso queda enganchado al fixture, la partida
            sabe qué equipos jugaron y los jugadores que todavía no tenían equipo se dan de alta
            solos.
          </p>
        </div>
        <Link
          href="/admin/upload"
          className="border-2 border-line-strong px-4 py-2 text-sm transition-colors hover:border-accent"
        >
          Subir replays
        </Link>
      </header>

      <dl className="grid grid-cols-2 gap-0.5 bg-line sm:grid-cols-4">
        <Stat label="Sin asignar" value={matches.length} tone={matches.length > 0} />
        <Stat label="Cruces jugados" value={done.length} />
        <Stat label="Cruces por jugar" value={pending.length} />
        <Stat label="Novedades de plantel" value={review.length} tone={review.length > 0} />
      </dl>

      {/*
        Que hay para revisar y en que ficha. No se resuelve desde aca a
        proposito: decidir si un nick que aparecio es el nick nuevo de alguien o
        un suplente que entro necesita ver el plantel entero al lado, y eso es
        justo lo que muestra la ficha del equipo.
      */}
      {conNovedades.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="border-b-2 border-line-strong pb-2 font-display text-lg uppercase tracking-wide">
            Planteles por revisar
          </h2>
          <p className="max-w-2xl text-sm text-muted">
            Los replays contaron algo distinto de lo que se habia cargado a mano: alguien que
            aparecio sin estar anotado, alguien anotado que no jugo, o una linea que cambio. Las
            lineas ya se corrigieron solas; lo que queda por decidir es de quien es cada cuenta.
          </p>
          <ul className="grid gap-0.5 bg-line sm:grid-cols-2">
            {conNovedades.map((team) => (
              <li
                key={team.id}
                className="flex items-baseline justify-between gap-3 bg-surface px-4 py-2 text-sm"
              >
                <Link
                  href={`/equipos/${team.id}`}
                  className="min-w-0 truncate transition-colors hover:text-accent"
                >
                  {team.name}
                </Link>
                <span className="tabular shrink-0 text-xs text-muted">
                  {team.n === 1 ? '1 novedad' : `${team.n} novedades`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/*
        Cargar el que no se jugo. El reglamento da 15 minutos de tolerancia y
        pasados esos hay un resultado sin partida, que es lo unico que el resto
        del panel no puede tomar: todo lo demas arranca de un .rofl.

        Van juntos los pendientes y los ya dados por ganado. Los segundos no se
        esconden porque un W.O. cargado mal le saca un punto a alguien en la
        tabla, y para deshacerlo hay que poder verlo.
      */}
      {(pending.length > 0 || walkovers.length > 0) && (
        <section className="flex flex-col gap-3">
          <h2 className="border-b-2 border-line-strong pb-2 font-display text-lg uppercase tracking-wide">
            Cruces sin jugar
          </h2>
          <p className="max-w-2xl text-sm text-muted">
            Si un equipo no se presento dentro de los 15 minutos, cargalo aca y el cruce se le da
            por ganado al otro. Suma partido, victoria y derrota en la tabla, pero no kills: no se
            jugo nada. No se crea ninguna partida, asi que no aparece en el listado ni en las
            estadisticas.
          </p>
          <ul className="flex flex-col gap-0.5 bg-line">
            {[...walkovers, ...pending].map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 bg-surface px-4 py-2.5 text-sm"
              >
                <span className="min-w-0">
                  <span className="text-faint">
                    F{row.matchday}·T{row.slot}
                  </span>{' '}
                  {row.team_a_name} vs {row.team_b_name}
                  {row.walkover_team_id && (
                    <span className="ml-2 text-xs text-accent">
                      W.O. a favor de{' '}
                      {row.walkover_team_id === row.team_a_id ? row.team_a_name : row.team_b_name}
                    </span>
                  )}
                </span>
                <Walkover
                  fixtureId={row.id}
                  teamA={{ id: row.team_a_id, name: row.team_a_name }}
                  teamB={{ id: row.team_b_id, name: row.team_b_name }}
                  current={row.walkover_team_id}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {!tournamentId && (
        <p className="border-2 border-danger/40 bg-danger-dim px-4 py-3 text-sm text-danger">
          El torneo no está cargado en la base. Corré <code>npm run seed:lide2</code>.
        </p>
      )}

      {matches.length === 0 ? (
        <p className="border-2 border-dashed border-line-strong px-6 py-10 text-center text-sm text-fg-soft">
          No hay partidas esperando. Todo lo que se subió ya está enganchado a su cruce.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {matches.map((match) => (
            <AssignMatch key={match.matchId} match={match} fixtures={options} />
          ))}
        </ul>
      )}

      {done.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="border-b-2 border-line-strong pb-2 font-display text-lg uppercase tracking-wide">
            Ya asignadas
          </h2>
          <ul className="grid gap-0.5 bg-line sm:grid-cols-2">
            {done.map((row) => (
              <li
                key={row.id}
                className="flex items-baseline justify-between gap-3 bg-surface px-4 py-2 text-sm"
              >
                <span className="min-w-0 truncate">
                  <span className="text-faint">
                    F{row.matchday}·T{row.slot}
                  </span>{' '}
                  {row.team_a_name} vs {row.team_b_name}
                </span>
                <Link
                  href={`/partidas/${row.match_id}`}
                  className="shrink-0 text-xs text-muted transition-colors hover:text-accent"
                >
                  {formatDate(row.played_at)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

/** "Equipo 15 (UNER / UADE)": the number alone tells nothing apart. */
function label(name: string, universities: string[] | null): string {
  return universities && universities.length > 0 ? `${name} (${universities.join(' / ')})` : name
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: boolean }) {
  return (
    <div className="bg-surface px-4 py-3 text-fg">
      <dt className="text-xs uppercase tracking-wide text-faint">{label}</dt>
      <dd className={`font-display text-2xl tabular-nums ${tone ? 'text-accent' : ''}`}>{value}</dd>
    </div>
  )
}
