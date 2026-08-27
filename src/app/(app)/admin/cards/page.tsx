import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { rows } from '@/lib/supabase/query'
import { CALENDAR, TOURNAMENT } from '@/lib/lide2/tournament'
import { loadStats, resolveTournamentId } from '@/lib/stats/query'
import { buildPosters } from '@/lib/cards/batch'
import { PosterBatch } from '@/components/cards/PosterBatch'
import type { StatScope } from '@/lib/stats/types'
import type { GroupStandingRow } from '@/types/db'

export const dynamic = 'force-dynamic'

/**
 * Las piezas de una fecha, para redes.
 *
 * Mismo recorte que /estadisticas y a propósito: lo que se publica tiene que
 * ser exactamente lo que dice el sitio. Si esta página calculara su propio MVP,
 * tarde o temprano el posteo y la web se contradirían, y el que queda mal es el
 * torneo.
 */

const MATCHDAYS = CALENDAR.filter((milestone) => milestone.phase === 'grupos').map(
  (milestone, index) => ({ matchday: index + 1, label: milestone.label }),
)

function parseScope(value: string | string[] | undefined, tournamentId: string): StatScope {
  const raw = Array.isArray(value) ? value[0] : value
  const matchday = Number(raw)
  const valid = MATCHDAYS.some((entry) => entry.matchday === matchday)

  return { tournamentId, phase: 'grupos', matchday: valid ? matchday : null }
}

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

  // La tabla de posiciones es siempre la acumulada, también cuando se está
  // mirando una fecha: no existe "la tabla de la fecha 2", existe cómo quedó
  // la tabla después de la fecha 2, que es lo que se publica.
  const standings = rows<GroupStandingRow>(standingsRes, 'la tabla de posiciones')
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

      <nav aria-label="Recorte" className="flex flex-wrap gap-1">
        <ScopeLink label="Toda la fase" href="/admin/cards" active={scope.matchday === null} />
        {MATCHDAYS.map((entry) => (
          <ScopeLink
            key={entry.matchday}
            label={entry.label}
            href={`/admin/cards?fecha=${entry.matchday}`}
            active={scope.matchday === entry.matchday}
          />
        ))}
      </nav>

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

function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="border-2 border-line bg-surface px-6 py-10 text-center text-fg">
      <p className="font-display text-lg uppercase tracking-wide">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">{detail}</p>
    </div>
  )
}
