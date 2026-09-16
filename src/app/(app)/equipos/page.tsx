import Link from 'next/link'
import { getUser } from '@/lib/auth'
import { formatPercent } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'
import { rows } from '@/lib/supabase/query'
import { tournamentStartDate } from '@/lib/lide2/tournament'
import { UniversityLogos } from '@/components/tournament/UniversityLogo'
import { TeamOrderPicker } from '@/components/tournament/TeamOrderPicker'
import { parseTeamOrder, sortTeams } from '@/lib/teams/order'
import { teamPath } from '@/lib/routes'
import { createTeamAction, relinkAction } from './actions'

export const metadata = {
  title: 'Equipos',
  description: 'Los 20 equipos del torneo, con su récord y sus jugadores.',
}

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

export default async function TeamsPage({ searchParams }: PageProps<'/equipos'>) {
  // Public list. `getUser` only hides admin controls; the actions check the
  // session themselves with `requireUser()`.
  const user = await getUser()
  const params = await searchParams
  const created = Number(params.creados ?? 0)
  const order = parseTeamOrder(params.orden)

  const supabase = await createClient()
  const [totalsRes, unisRes] = await Promise.all([
  // Sorted by `sortTeams`: win rate is not a column in this view.
    supabase.from('team_totals').select('*'),
    // The crest file comes from the tag (see UniversityLogo).
    supabase
      .from('team_universities')
      .select('team_id,order_index,universities(tag)')
      .order('order_index'),
  ])

  const teams = sortTeams(rows<TeamTotalsRow>(totalsRes, 'the teams'), order)

  const universities = new Map<string, string[]>()
  for (const row of rows<{ team_id: string; universities: { tag: string } | null }>(
    unisRes as never,
    'the teams universities',
  )) {
    if (!row.universities) continue
    universities.set(row.team_id, [
      ...(universities.get(row.team_id) ?? []),
      row.universities.tag,
    ])
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          {/* Same heading style as the other sections, so it does not jump
              between pages. */}
          <h1 className="font-display text-3xl uppercase tracking-tight">Equipos</h1>
          {/* How matches link to teams is only useful to admins. */}
          <p className="mt-1 text-sm text-muted">
            {user
              ? 'Cada partida se vincula sola cuando 3 o más de sus jugadores están en el plantel.'
              : `Los ${teams.length} equipos del torneo, ${
                  order === 'winrate' ? 'del que más gana al que menos' : 'por orden alfabético'
                }.`}
          </p>
        </div>
        {user && (
          <div className="flex gap-2">
            <Link
              href="/equipos/detectar"
              className="rounded bg-accent-strong px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent"
            >
              Detectar desde las partidas
            </Link>
            <form action={relinkAction}>
              <button
                type="submit"
                className="rounded border border-line-strong px-4 py-2 text-sm transition-colors hover:border-accent"
              >
                Revincular partidas
              </button>
            </form>
          </div>
        )}
      </div>

      {created > 0 && (
        <p className="rounded border border-ok/40 bg-ok-dim px-4 py-3 text-sm text-ok">
          Se crearon {created} equipos y se revincularon las partidas.
        </p>
      )}

      {user && (
        <form action={createTeamAction} className="flex gap-2">
          <input
            name="name"
            required
            placeholder="Nombre del equipo"
            className="flex-1 rounded border border-line-strong bg-surface px-3 py-2 text-sm focus:border-accent"
          />
          <button
            type="submit"
            className="rounded border border-line-strong px-4 py-2 text-sm transition-colors hover:border-accent"
          >
            Crear vacío
          </button>
        </form>
      )}

      {/* Next to the cards it sorts; hidden when there are no teams. */}
      {teams.length > 0 && <TeamOrderPicker order={order} />}

      {teams.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line-strong px-6 py-12 text-center text-fg-soft">
          <p>Todavía no hay equipos.</p>
          {/* "Detectar desde las partidas" is an admin button, so visitors get
              a different hint. */}
          <p className="mt-1 text-sm text-faint">
            {user
              ? 'Probá con “Detectar desde las partidas”: agrupa a los jugadores por quiénes jugaron juntos.'
              : `Los equipos se publican antes del arranque, el ${tournamentStartDate()}.`}
          </p>
        </div>
      ) : (
        /*
          Cards rather than rows, so the crests have room: they identify a team
          at a glance better than "Equipo 15". Mixed teams show all three.
        */
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((team) => {
            const tags = universities.get(team.team_id) ?? []
            const losses = team.games - team.wins

            return (
              <li key={team.team_id}>
                <Link
                  href={teamPath(team.team_id)}
                  className="flex h-full flex-col gap-3 border-2 border-line bg-surface p-4 transition-colors hover:border-accent"
                >
                  {/*
                    Team name and crests on top, numbers across the bottom. At
                    48px, three crests still fit next to the name on a one-column
                    phone layout.
                  */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{team.name}</p>
                      {tags.length > 0 && (
                        <p className="truncate text-xs text-faint">{tags.join(' / ')}</p>
                      )}
                    </div>
                    <UniversityLogos tags={tags} size="card" max={3} />
                  </div>

                  {/* mt-auto keeps the numbers at the bottom when a name wraps. */}
                  <dl className="mt-auto flex items-end justify-between gap-2 border-t border-line pt-3">
                    <div>
                      <dt className="text-[10px] uppercase tracking-[0.15em] text-dim">Récord</dt>
                      <dd className="tabular text-sm">
                        <span className="text-win">{team.wins}</span>
                        <span className="text-dim">–</span>
                        <span className="text-loss">{losses}</span>
                      </dd>
                    </div>
                    <div className="text-right">
                      <dt className="text-[10px] uppercase tracking-[0.15em] text-dim">Victorias</dt>
                      <dd className="tabular text-sm text-muted">
                        {team.games > 0 ? formatPercent(team.wins / team.games) : '—'}
                      </dd>
                    </div>
                    <div className="text-right">
                      <dt className="text-[10px] uppercase tracking-[0.15em] text-dim">Duración</dt>
                      <dd className="tabular text-sm text-muted">
                        {team.avg_minutes ? `${team.avg_minutes} min` : '—'}
                      </dd>
                    </div>
                  </dl>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
