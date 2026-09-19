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
import { parseScope, scopeLabel, scopeValue } from '@/lib/stats/scope'
import type { GroupStandingRow } from '@/types/db'

export const dynamic = 'force-dynamic'

/**
 * A matchday's social media pieces, built from the same scope and stats as
 * /estadisticas so what gets published always matches the site.
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

  // The standings are always cumulative: the table as it stood after the
  // selected matchday.
  const standings = rows<GroupStandingRow>(standingsRes, 'the standings table')
  const posters = buildPosters(data, standings)

  // Goes into every downloaded file name, so it says which cut the batch is.
  const prefix = `lide2-${scopeValue(scope) ?? 'torneo'}`

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Link href="/admin" className="text-sm text-muted transition-colors hover:text-fg">
          ← Panel
        </Link>
        <h1 className="font-display text-3xl uppercase tracking-tight">Cards</h1>
        <p className="max-w-2xl text-sm text-muted">
          El lote de {scopeLabel(scope).toLowerCase()}. Cada pieza con sus datos crudos al lado: el
          PNG para subir directo, el texto o el CSV para pasárselo a quien la arme por su cuenta.
        </p>
      </header>

      <ScopeNav base="/admin/cards" scope={scope} />

      {posters.length === 0 ? (
        <Empty
          title="Todavía no hay nada para publicar"
          detail={
            scope.kind === 'torneo'
              ? 'En cuanto se asigne el primer replay a su cruce, el lote se arma solo.'
              : 'Ninguna partida de este recorte tiene el replay cargado y asignado todavía.'
          }
        />
      ) : (
        <PosterBatch posters={posters} prefix={prefix} />
      )}
    </div>
  )
}


