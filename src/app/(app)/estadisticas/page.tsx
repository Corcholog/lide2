import { Suspense } from 'react'
import { getUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatDuration, formatNumber } from '@/lib/format'
import { tournamentStartDate, TOURNAMENT } from '@/lib/lide2/tournament'
import { loadStats, resolveTournamentId } from '@/lib/stats/query'
import { buildStats } from '@/lib/stats/registry'
import { StatCard } from '@/components/stats/StatCard'
import { ScopeNav } from '@/components/stats/ScopeNav'
import { ViewNav } from '@/components/stats/ViewNav'
import { SectionNav } from '@/components/tournament/SectionNav'
import { Empty } from '@/components/stats/Empty'
import { RankingsSkeleton } from '@/components/stats/Skeleton'
import { parseScope, scopeSubtitle, scopeValue } from '@/lib/stats/scope'
import type { StatScope } from '@/lib/stats/types'

export const metadata = {
  title: 'Estadísticas',
  description:
    'Los rankings del torneo entero, de los playoffs y de la fase de grupos fecha por fecha: MVP, el quinteto, el meta y los récords.',
}

export const dynamic = 'force-dynamic'

/**
 * The stat cards, one scope at a time.
 *
 * The page itself touches no database: the scope comes from the URL, so the
 * heading and the pickers are sent straight away and the numbers stream in
 * behind them. Picking a filter used to leave the bar looking untouched for as
 * long as the whole page took; now the chips repaint at once and the cards
 * arrive when they are ready.
 */
export default async function StatsPage({ searchParams }: PageProps<'/estadisticas'>) {
  const scope = parseScope((await searchParams).fecha)

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl uppercase tracking-tight">Estadísticas</h1>
        <p className="text-sm text-muted">{scopeSubtitle(scope)}</p>
      </header>

      <div className="flex flex-col gap-2">
        <ViewNav active="rankings" query={{ fecha: scopeValue(scope) }} />
        <ScopeNav base="/estadisticas" scope={scope} />
      </div>

      {/*
        Keyed on the scope: without a key React would keep the previous scope's
        cards on screen while the new ones load, which reads as nothing having
        happened. A new key retires that boundary and shows the skeleton again.
      */}
      <Suspense key={scopeValue(scope) ?? 'torneo'} fallback={<RankingsSkeleton />}>
        <Rankings scope={scope} />
      </Suspense>
    </div>
  )
}

/** Everything that needs the database, so it can suspend on its own. */
async function Rankings({ scope }: { scope: StatScope }) {
  const supabase = await createClient()
  const tournamentId = await resolveTournamentId(supabase)

  if (!tournamentId) {
    /*
      Without a tournament: admins get the setup command, visitors a plain
      "nothing published yet". `getUser` is only read here, off the path
      everyone else takes.
    */
    return (await getUser()) ? (
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

  const data = await loadStats(supabase, scope, tournamentId)
  const sections = buildStats(data)

  const played = data.records.length
  const kills = data.records.reduce((total, row) => total + row.total_kills, 0)
  const totalMs = data.records.reduce((total, row) => total + row.game_length_ms, 0)

  if (played === 0) {
    return (
      <Empty
        title="Todavía no se jugó nada acá"
        detail={
          scope.kind === 'torneo'
            ? 'En cuanto se suba el primer replay, esta página se llena sola.'
            : 'Ninguna partida de este recorte tiene el replay cargado todavía.'
        }
      />
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <dl className="grid grid-cols-2 gap-0.5 bg-line sm:grid-cols-4">
        <Summary label="Partidas" value={formatNumber(played)} />
        <Summary label="Kills" value={formatNumber(kills)} />
        <Summary label="Duración total" value={formatDuration(totalMs)} />
        <Summary label="Promedio" value={formatDuration(Math.round(totalMs / played))} />
      </dl>

      {/* Section bar, as on the home page. Only sections with data are listed. */}
      <SectionNav sections={sections.map(({ id, label }) => ({ id, label }))} />

      {sections.map((section) => (
        <section key={section.id} id={section.id} className="flex flex-col gap-3">
          <div className="flex items-baseline gap-3 border-b-2 border-line-strong pb-2">
            <h2 className="font-display text-lg uppercase tracking-wide">{section.label}</h2>
            <p className="text-xs text-muted">{section.description}</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {section.blocks.map((block) => (
              <StatCard key={block.id} block={block} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface px-4 py-3 text-fg">
      <dt className="text-xs uppercase tracking-wide text-faint">{label}</dt>
      <dd className="font-display text-xl tabular-nums">{value}</dd>
    </div>
  )
}
