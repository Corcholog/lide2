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
import { parseScope } from '@/lib/stats/scope'

export const metadata = {
  title: 'Estadísticas',
  description:
    'Los rankings de la fase de grupos, fecha por fecha y acumulados: MVP, el quinteto, el meta y los récords.',
}

export const dynamic = 'force-dynamic'


export default async function StatsPage({ searchParams }: PageProps<'/estadisticas'>) {
  const supabase = await createClient()
  const [user, tournamentId] = await Promise.all([getUser(), resolveTournamentId(supabase)])

  if (!tournamentId) {
    /*
      With no tournament in the database there is nothing to show, but the
      reason matters to exactly one person. An admin can use the exact command;
      to a visitor, a terminal command on screen is noise - and on top of that
      it gives away that something is half-built. For them it is simply that
      nothing has been published yet.
    */
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

  const scope = parseScope((await searchParams).fecha, tournamentId)
  const data = await loadStats(supabase, scope)
  const sections = buildStats(data)

  const played = data.records.length
  const kills = data.records.reduce((total, row) => total + row.total_kills, 0)
  const totalMs = data.records.reduce((total, row) => total + row.game_length_ms, 0)

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl uppercase tracking-tight">Estadísticas</h1>
        <p className="text-sm text-muted">
          {scope.matchday === null
            ? 'Acumulado de toda la fase de grupos'
            : `Fecha ${scope.matchday} de la fase de grupos`}
        </p>
      </header>

      <div className="flex flex-col gap-2">
        <ViewNav active="rankings" query={{ fecha: scope.matchday }} />
        <ScopeNav base="/estadisticas" matchday={scope.matchday} />
      </div>

      {played === 0 ? (
        <Empty
          title="Todavía no se jugó nada acá"
          detail={
            scope.matchday === null
              ? `La ${TOURNAMENT.name} arranca el 5 de septiembre. En cuanto se suba el primer replay, esta página se llena sola.`
              : 'Ninguna partida de esta fecha tiene el replay cargado todavía.'
          }
        />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-0.5 bg-line sm:grid-cols-4">
            <Summary label="Partidas" value={formatNumber(played)} />
            <Summary label="Kills" value={formatNumber(kills)} />
            <Summary label="Duración total" value={formatDuration(totalMs)} />
            <Summary label="Promedio" value={formatDuration(Math.round(totalMs / played))} />
          </dl>

          {/*
            The section bar, the same one the home page uses.

            It is thirty-three rankings across five blocks: without this,
            reaching the meta means scrolling blindly past every individual one.
            The bar docks to the top on scroll and marks which one you are in,
            and sections left without data do not appear because they come from
            `sections`, which arrives already filtered.
          */}
          <SectionNav sections={sections.map(({ id, label }) => ({ id, label }))} />

          {sections.map((section) => (
            <section key={section.id} id={section.id} className="flex scroll-mt-16 flex-col gap-3">
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
        </>
      )}
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

