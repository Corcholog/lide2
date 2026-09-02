import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { rows } from '@/lib/supabase/query'
import { TOURNAMENT } from '@/lib/lide2/tournament'
import { loadStats, resolveTournamentId } from '@/lib/stats/query'
import { buildPosters } from '@/lib/cards/batch'
import { PosterBatch } from '@/components/cards/PosterBatch'
import { ScopeNav } from '@/components/stats/ScopeNav'
import { Empty } from '@/components/stats/Empty'
import { parseScope } from '@/lib/stats/scope'
import type { GroupStandingRow } from '@/types/db'

export const dynamic = 'force-dynamic'

/**
 * A matchday's pieces, for social media.
 *
 * The same scope as /estadisticas, and deliberately so: what gets published has
 * to be exactly what the site says. If this page computed its own MVP, sooner
 * or later the post and the site would contradict each other, and the one that
 * comes off badly is the tournament.
 */


export default async function CardsPage({ searchParams }: PageProps<'/admin/cards'>) {
  await requireUser()

  const supabase = await createClient()
  const tournamentId = await resolveTournamentId(supabase)

  if (!tournamentId) {
    return (
      <Empty
        title="Todavía no hay torneo cargado"
        detail={`Corré \`npm run seed:lide2\` para crear la ${TOURNAMENT.name} en la base.`}
      />
    )
  }

  const scope = parseScope((await searchParams).fecha, tournamentId)

  const [data, standingsRes] = await Promise.all([
    loadStats(supabase, scope),
    supabase.from('group_standings').select('*').eq('tournament_id', tournamentId).order('position'),
  ])

  // The standings table is always the accumulated one, even while looking at a
  // single matchday: there is no such thing as "matchday 2's table", there is
  // how the table stood after matchday 2, which is what gets published.
  const standings = rows<GroupStandingRow>(standingsRes, 'the standings table')
  const posters = buildPosters(data, standings)

  const prefix = scope.matchday === null ? 'lide2-acumulado' : `lide2-fecha-${scope.matchday}`

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Link href="/admin" className="text-sm text-muted transition-colors hover:text-fg">
          ← Panel
        </Link>
        <h1 className="font-display text-3xl uppercase tracking-tight">Cards</h1>
        <p className="max-w-2xl text-sm text-muted">
          El lote de {scope.matchday === null ? 'toda la fase' : `la fecha ${scope.matchday}`}. Cada
          pieza con sus datos crudos al lado: el PNG para subir directo, el texto o el CSV para
          pasárselo a quien la arme por su cuenta.
        </p>
      </header>

      <ScopeNav base="/admin/cards" matchday={scope.matchday} />

      {posters.length === 0 ? (
        <Empty
          title="Todavía no hay nada para publicar"
          detail={
            scope.matchday === null
              ? `La ${TOURNAMENT.name} arranca el 5 de septiembre. En cuanto se asigne el primer replay a su cruce, el lote se arma solo.`
              : 'Ninguna partida de esta fecha tiene el replay cargado y asignado todavía.'
          }
        />
      ) : (
        <PosterBatch posters={posters} prefix={prefix} />
      )}
    </div>
  )
}


