import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatDuration, formatNumber } from '@/lib/format'
import { CALENDAR, TOURNAMENT } from '@/lib/lide2/tournament'
import { loadStats, resolveTournamentId } from '@/lib/stats/query'
import { buildStats } from '@/lib/stats/registry'
import { StatCard } from '@/components/estadisticas/StatCard'
import type { StatScope } from '@/lib/stats/types'

export const metadata = {
  title: 'Estadísticas',
  description:
    'Los rankings de la fase de grupos, fecha por fecha y acumulados: MVP, el quinteto, el meta y los récords.',
}

export const dynamic = 'force-dynamic'

/**
 * Los recortes que se pueden elegir.
 *
 * Salen del calendario y no de una lista aparte para que no se desincronicen:
 * si se agrega una fecha, aparece sola acá. Ojo con la diferencia entre fecha y
 * turno: la 1 y la 2 se juegan en dos turnos cada una, así que "fecha" no es lo
 * mismo que "partido".
 */
const MATCHDAYS = CALENDAR.filter((milestone) => milestone.phase === 'grupos').map(
  (milestone, index) => ({ matchday: index + 1, label: milestone.label }),
)

/** `?fecha=2`, o el acumulado si no viene o no se entiende. */
function parseScope(value: string | string[] | undefined, tournamentId: string): StatScope {
  const raw = Array.isArray(value) ? value[0] : value
  const matchday = Number(raw)
  const valid = MATCHDAYS.some((entry) => entry.matchday === matchday)

  return { tournamentId, phase: 'grupos', matchday: valid ? matchday : null }
}

export default async function StatsPage({ searchParams }: PageProps<'/estadisticas'>) {
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

      <nav aria-label="Recorte" className="flex flex-wrap gap-1">
        <ScopeLink label="Toda la fase" href="/estadisticas" active={scope.matchday === null} />
        {MATCHDAYS.map((entry) => (
          <ScopeLink
            key={entry.matchday}
            label={entry.label}
            href={`/estadisticas?fecha=${entry.matchday}`}
            active={scope.matchday === entry.matchday}
          />
        ))}
      </nav>

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

          {sections.map((section) => (
            <section key={section.id} className="flex flex-col gap-3">
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

function ScopeLink({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'true' : undefined}
      className={`border-2 px-3 py-1 text-xs font-bold uppercase tracking-wide transition-colors ${
        active
          ? 'border-accent bg-accent-dim text-accent'
          : 'border-line text-muted hover:border-line-strong hover:text-accent'
      }`}
    >
      {label}
    </Link>
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

function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="border-2 border-line bg-surface px-6 py-10 text-center text-fg">
      <p className="font-display text-lg uppercase tracking-wide">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">{detail}</p>
    </div>
  )
}
