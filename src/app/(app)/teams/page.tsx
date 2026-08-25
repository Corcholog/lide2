import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createTeamAction, relinkAction } from './actions'

export const dynamic = 'force-dynamic'

interface TeamTotalsRow {
  team_id: string
  name: string
  tag: string | null
  games: number
  wins: number
  avg_minutes: number | null
  kills: number | null
}

export default async function TeamsPage({ searchParams }: PageProps<'/teams'>) {
  await requireUser()
  const params = await searchParams
  const created = Number(params.creados ?? 0)

  const supabase = await createClient()
  const { data } = await supabase.from('team_totals').select('*').order('wins', { ascending: false })
  const teams = (data ?? []) as TeamTotalsRow[]

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Equipos</h1>
          <p className="mt-1 text-sm text-ink-400">
            Cada partida se vincula sola cuando 3 o más de sus jugadores están en el roster.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/teams/detectar"
            className="rounded bg-brand-red px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-red-soft"
          >
            Detectar desde las partidas
          </Link>
          <form action={relinkAction}>
            <button
              type="submit"
              className="rounded border border-ink-700 px-4 py-2 text-sm transition-colors hover:border-ink-500"
            >
              Revincular partidas
            </button>
          </form>
        </div>
      </div>

      {created > 0 && (
        <p className="rounded border border-brand-aqua/40 bg-brand-aqua-dim/40 px-4 py-3 text-sm text-brand-aqua">
          Se crearon {created} equipos y se revincularon las partidas.
        </p>
      )}

      <form action={createTeamAction} className="flex gap-2">
        <input
          name="name"
          required
          placeholder="Nombre del equipo"
          className="flex-1 rounded border border-ink-700 bg-ink-900 px-3 py-2 text-sm outline-none focus:border-brand-aqua"
        />
        <button
          type="submit"
          className="rounded border border-ink-700 px-4 py-2 text-sm transition-colors hover:border-ink-500"
        >
          Crear vacío
        </button>
      </form>

      {teams.length === 0 ? (
        <div className="rounded-lg border border-dashed border-ink-700 px-6 py-12 text-center text-ink-300">
          <p>Todavía no hay equipos.</p>
          <p className="mt-1 text-sm text-ink-500">
            Probá con &ldquo;Detectar desde las partidas&rdquo;: agrupa a los jugadores por quiénes
            jugaron juntos.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-ink-800 rounded-lg border border-ink-800">
          {teams.map((team) => (
            <li key={team.team_id}>
              <Link
                href={`/teams/${team.team_id}`}
                className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-ink-900"
              >
                <span className="flex-1 truncate font-medium">{team.name}</span>
                <span className="tabular text-sm text-ink-400">
                  {team.wins}–{team.games - team.wins}
                </span>
                <span className="tabular w-16 text-right text-sm text-ink-500">
                  {team.games > 0 ? `${Math.round((team.wins / team.games) * 100)}%` : '—'}
                </span>
                <span className="tabular hidden w-24 text-right text-sm text-ink-500 sm:inline">
                  {team.avg_minutes ? `${team.avg_minutes} min` : '—'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
