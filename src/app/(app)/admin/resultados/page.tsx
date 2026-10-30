import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { rows } from '@/lib/supabase/query'
import { resolveTournamentId } from '@/lib/stats/query'
import { LiveResult } from '@/components/admin/LiveResult'
import type { SeriesResultRow } from '@/types/db'

export const metadata = { title: 'Resultados en vivo' }

export const dynamic = 'force-dynamic'

/**
 * Where the result of each playoff game is typed while it is being played.
 *
 * A replay can only be uploaded after the game, and often well after, but the
 * organizers know who won as it happens. A result entered here moves the score
 * and the bracket on at once; the replay is filed later in /admin/asignar under
 * the same game number and takes the result's place.
 */
export default async function ResultsPage() {
  await requireUser()

  const supabase = await createClient()
  const tournamentId = await resolveTournamentId(supabase)

  const series = tournamentId
    ? rows<SeriesResultRow>(
        await supabase
          .from('series_results')
          .select('*')
          .eq('tournament_id', tournamentId)
          .order('stage_order')
          .order('order_index'),
        'the playoff series',
      )
    : []

  // Only a series with both teams can be played, and one given on a no-show
  // has no games to enter.
  const playable = series.filter(
    (item) => item.team_a_id && item.team_b_id && item.walkover_team_id === null,
  )

  const ids = playable.map((item) => item.id)
  const [liveRes, filedRes] = ids.length
    ? await Promise.all([
        supabase
          .from('series_game_results')
          .select('series_id,game_number,winner_team_id')
          .in('series_id', ids),
        supabase.from('matches').select('series_id,game_number').in('series_id', ids),
      ])
    : [{ data: [] }, { data: [] }]

  const live = new Map<string, string>()
  for (const row of liveRes.data ?? []) {
    live.set(`${row.series_id}:${row.game_number}`, row.winner_team_id as string)
  }

  const filed = new Set<string>()
  for (const row of filedRes.data ?? []) {
    if (row.game_number !== null) filed.add(`${row.series_id}:${row.game_number}`)
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <Link href="/admin" className="text-xs text-muted hover:text-accent">
          ← Panel
        </Link>
        <h1 className="font-display text-3xl uppercase tracking-tight">Resultados en vivo</h1>
        <p className="max-w-2xl text-sm text-muted">
          Cargá quién ganó cada partida apenas termina: el marcador y el bracket se actualizan al
          instante, sin esperar el replay. Cuando lo tengas, subilo y asignalo en{' '}
          <Link href="/admin/asignar" className="text-accent underline">
            Asignar partidas
          </Link>{' '}
          con el mismo número de partida; reemplaza al resultado cargado acá y no se cuenta dos
          veces. Las estadísticas de jugadores salen recién del replay.
        </p>
      </header>

      {playable.length === 0 ? (
        <p className="border border-line px-4 py-3 text-sm text-muted">
          Todavía no hay series con sus dos equipos. Cargá el sorteo en{' '}
          <Link href="/admin/cruces" className="text-accent underline">
            Cruces
          </Link>
          .
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {playable.map((item) => {
            const teamA = { id: item.team_a_id!, name: item.team_a_name ?? 'Equipo A' }
            const teamB = { id: item.team_b_id!, name: item.team_b_name ?? 'Equipo B' }

            return (
              <li key={item.id} className="flex flex-col gap-3 border-2 border-line bg-surface p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-2xs font-bold uppercase tracking-wide text-faint">
                    {item.round} · Cruce {item.order_index} · BO{item.best_of}
                  </p>
                  <p className="tabular text-sm font-semibold">
                    {teamA.name} {item.wins_a} – {item.wins_b} {teamB.name}
                    {item.winner_team_id && ' · terminada'}
                  </p>
                </div>

                {Array.from({ length: item.best_of }, (_, index) => index + 1).map((game) => (
                  <LiveResult
                    key={`${item.id}-${game}-${live.get(`${item.id}:${game}`) ?? ''}`}
                    seriesId={item.id}
                    game={game}
                    teamA={teamA}
                    teamB={teamB}
                    current={live.get(`${item.id}:${game}`) ?? null}
                    hasReplay={filed.has(`${item.id}:${game}`)}
                  />
                ))}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
