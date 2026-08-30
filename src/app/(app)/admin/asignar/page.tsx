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
 * El panel del día de partido.
 *
 * Se sube el .rofl, se dice de qué cruce es, y con eso la base se entera de
 * todo lo demás: qué equipos jugaron, de qué fecha es, y —la primera vez— qué
 * cuenta de Riot es de qué equipo. Ver `supabase/migrations/0011_asignacion.sql`
 * para por qué el orden es ése y no al revés.
 */
export default async function AsignarPage() {
  await requireUser()

  const supabase = await createClient()
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('id')
    .eq('slug', TOURNAMENT.slug)
    .maybeSingle()

  const tournamentId = (tournament?.id as string) ?? null

  const [pendingRes, fixtureRes] = await Promise.all([
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
  ])

  // Los replays sin asignar pueden ser de parches distintos, pero los nombres de
  // los campeones no cambian entre uno y otro: alcanza con el catálogo del
  // último. Acá se reconoce un equipo mirando el scoreboard, así que conviene
  // que diga lo mismo que el resto del sitio y no la clave interna del .rofl.
  const champNames = await championNames(await assetVersion(null))
  const named = (players: SidePlayer[]): SidePlayer[] =>
    players.map((player) => ({ ...player, champion: championName(champNames, player.champion) }))

  const matches = rows<UnassignedRow>(pendingRes, 'las partidas sin asignar').map(
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

  const fixture = rows<FixtureResultRow>(fixtureRes, 'el fixture')
  const pending = fixture.filter((row) => row.match_id === null)
  const done = fixture.filter((row) => row.match_id !== null)

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

      <dl className="grid grid-cols-3 gap-0.5 bg-line">
        <Stat label="Sin asignar" value={matches.length} tone={matches.length > 0} />
        <Stat label="Cruces jugados" value={done.length} />
        <Stat label="Cruces por jugar" value={pending.length} />
      </dl>

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

/** "Equipo 15 (UNER / UADE)": el número solo no distingue nada. */
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
