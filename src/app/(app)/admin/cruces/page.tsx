import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { rows } from '@/lib/supabase/query'
import { qualifiedTeams } from '@/app/(app)/admin/actions'
import { resolveTournamentId } from '@/lib/stats/query'
import { DrawQuarters } from '@/components/admin/DrawQuarters'
import { SeriesWalkover } from '@/components/admin/SeriesWalkover'
import type { Pairing } from '@/lib/lide2/draw'
import type { SeriesResultRow } from '@/types/db'

export const metadata = { title: 'Cruces' }

export const dynamic = 'force-dynamic'

/**
 * Where the quarter-final draw is entered.
 *
 * Rule 2.3 crosses group winners with runners-up through a draw that tries to
 * keep teams of the same university apart, so the pairings cannot be worked out
 * from the table: the bracket says "A sortear" until they are typed in here.
 */
export default async function DrawPage() {
  await requireUser()

  const supabase = await createClient()
  const tournamentId = await resolveTournamentId(supabase)

  const all = tournamentId
    ? rows<SeriesResultRow>(
        await supabase
          .from('series_results')
          .select('*')
          .eq('tournament_id', tournamentId)
          .order('stage_order')
          .order('order_index'),
        'the bracket',
      )
    : []

  const series = all.filter((item) => item.round === 'Cuartos de final')
  /*
    A no-show can happen in any round, not only the drawn one, and there is no
    other way to move the bracket past one.
  */
  const awardable = all.filter((item) => item.team_a_id && item.team_b_id)

  const qualified = await qualifiedTeams()

  const current: Record<number, Pairing> = Object.fromEntries(
    series.map((item) => [item.order_index, { teamAId: item.team_a_id, teamBId: item.team_b_id }]),
  )

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Link href="/admin" className="text-sm text-muted transition-colors hover:text-fg">
          ← Panel
        </Link>
        <h1 className="font-display text-3xl uppercase tracking-tight">Cruces de playoffs</h1>
        <p className="max-w-2xl text-sm text-muted">
          El sorteo lo hacen ustedes: el reglamento (2.3) cruza 1º contra 2º evitando equipos de la
          misma universidad, así que el sitio no puede deducirlo. Hasta que los cargues acá, el
          bracket muestra «A sortear».
        </p>
      </header>

      {series.length === 0 ? (
        <p className="rounded border border-danger/40 bg-danger-dim px-4 py-3 text-sm text-danger">
          El bracket todavía no está cargado. Corré <code>npm run seed:lide2</code>.
        </p>
      ) : qualified.length < series.length * 2 ? (
        /*
          Half a group table cannot fill a bracket: better to say so than to
          offer selects that are missing teams.
        */
        <p className="rounded border border-danger/40 bg-danger-dim px-4 py-3 text-sm text-danger">
          Todavía no hay {series.length * 2} clasificados: la fase de grupos no terminó, o falta
          cargar resultados.
        </p>
      ) : (
        <DrawQuarters
          quarters={series.map((item) => item.order_index)}
          qualified={qualified}
          current={current}
        />
      )}

      {awardable.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-1 border-t border-line pt-6">
            <h2 className="font-display text-lg uppercase tracking-wide">No presentaciones</h2>
            <p className="max-w-2xl text-sm text-muted">
              Si un equipo no se presenta, la serie se le da al otro y pasa de ronda. Una serie
              otorgada no tiene partidas: el bracket muestra W.O. en vez de un resultado que nadie
              jugó.
            </p>
          </div>

          <ul className="flex flex-col gap-3">
            {awardable.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-2 border-2 border-line bg-surface px-4 py-3"
              >
                <p className="text-[11px] font-bold uppercase tracking-wide text-faint">
                  {item.round} · Cruce {item.order_index}
                </p>
                <SeriesWalkover
                  seriesId={item.id}
                  teamA={{ id: item.team_a_id!, name: item.team_a_name ?? 'Equipo A' }}
                  teamB={{ id: item.team_b_id!, name: item.team_b_name ?? 'Equipo B' }}
                  current={item.walkover_team_id}
                  hasGames={item.games_played > 0}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
