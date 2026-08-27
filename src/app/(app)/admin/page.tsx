import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { TOURNAMENT } from '@/lib/lide2/tournament'

export const dynamic = 'force-dynamic'

/**
 * El panel, en el orden en que se usa un día de partido.
 *
 * Subir → asignar → (si hace falta) emparejar → publicar. Los números al lado
 * de cada paso son lo que queda por hacer en ese paso: si dicen cero, ese día
 * está listo. Los dos últimos no son obligatorios: emparejar sólo corrige la
 * tabla de universidades, y publicar es lo que se hace después, no lo que hace
 * falta para que el sitio esté bien.
 */
export default async function AdminPage() {
  await requireUser()

  const supabase = await createClient()
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('id')
    .eq('slug', TOURNAMENT.slug)
    .maybeSingle()

  const tournamentId = (tournament?.id as string) ?? null

  const [pendingRes, fixtureRes, rosterRes] = await Promise.all([
    supabase.from('unassigned_matches').select('*', { count: 'exact', head: true }),
    tournamentId
      ? supabase
          .from('fixtures')
          .select('*', { count: 'exact', head: true })
          .eq('tournament_id', tournamentId)
          .is('match_id', null)
      : Promise.resolve({ count: 0 }),
    supabase.from('roster_status').select('player_id'),
  ])

  const roster = (rosterRes.data ?? []) as { player_id: string | null }[]
  const sinEmparejar = roster.filter((row) => row.player_id === null).length

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="font-display text-3xl uppercase tracking-tight">Panel</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Un día de partido son cuatro pasos, y sólo los dos primeros son obligatorios.
        </p>
      </header>

      <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Step
          n={1}
          href="/admin/upload"
          title="Subir replays"
          detail="Arrastrar los .rofl. Se lee la metadata y se guarda la partida."
          badge={null}
        />
        <Step
          n={2}
          href="/admin/asignar"
          title="Asignar partidas"
          detail="Decir de qué cruce es cada una. Con eso quedan los equipos, la fecha y el plantel."
          badge={
            pendingRes.count
              ? `${pendingRes.count} sin asignar`
              : `${fixtureRes.count ?? 0} cruces por jugar`
          }
          alert={Boolean(pendingRes.count)}
        />
        <Step
          n={3}
          href="/admin/planteles"
          title="Planteles"
          detail="Qué cuenta de Riot es cada inscripto. Sólo cambia la tabla de universidades."
          badge={sinEmparejar > 0 ? `${sinEmparejar} sin emparejar` : 'completo'}
        />
        <Step
          n={4}
          href="/admin/cards"
          title="Cards"
          detail="El lote de la fecha para redes. El PNG, o los números para pasárselos a alguien."
          badge="post e historia"
        />
      </ol>

      {!tournamentId && (
        <p className="border-2 border-danger/40 bg-danger-dim px-4 py-3 text-sm text-danger">
          El torneo no está cargado en la base. Corré <code>npm run seed:lide2</code>.
        </p>
      )}
    </div>
  )
}

function Step({
  n,
  href,
  title,
  detail,
  badge,
  alert,
}: {
  n: number
  href: string
  title: string
  detail: string
  badge: string | null
  alert?: boolean
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex h-full flex-col gap-2 border-2 border-line bg-surface p-4 text-fg transition-colors hover:border-accent"
      >
        <span className="font-display text-3xl leading-none text-faint">{n}</span>
        <span className="font-display text-sm uppercase tracking-wide">{title}</span>
        <span className="flex-1 text-xs text-muted">{detail}</span>
        {badge && (
          <span className={`text-xs font-medium ${alert ? 'text-accent' : 'text-faint'}`}>
            {badge}
          </span>
        )}
      </Link>
    </li>
  )
}
