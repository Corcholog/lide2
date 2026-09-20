import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { rows } from '@/lib/supabase/query'
import { qualifiedTeams } from '@/app/(app)/admin/actions'
import { resolveTournamentId } from '@/lib/stats/query'
import { DrawQuarters } from '@/components/admin/DrawQuarters'
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

  const series = tournamentId
    ? rows<SeriesResultRow>(
        await supabase
          .from('series_results')
          .select('*')
          .eq('tournament_id', tournamentId)
          .eq('round', 'Cuartos de final')
          .order('order_index'),
        'the quarter-finals',
      )
    : []

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
    </div>
  )
}
