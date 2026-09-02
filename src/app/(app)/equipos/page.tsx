import Link from 'next/link'
import { getUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { rows } from '@/lib/supabase/query'
import { tournamentStartDate } from '@/lib/lide2/tournament'
import { UniversityLogos } from '@/components/tournament/UniversityLogo'
import { TeamOrderPicker } from '@/components/tournament/TeamOrderPicker'
import { parseTeamOrder, sortTeams } from '@/lib/teams/order'
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
  // La lista se ve sin sesión; lo que se edita, no. El `getUser` de acá es para
  // no dibujar botones que no van a funcionar: quien los protege de verdad es
  // el `requireUser()` de cada action.
  const user = await getUser()
  const params = await searchParams
  const created = Number(params.creados ?? 0)
  const order = parseTeamOrder(params.orden)

  const supabase = await createClient()
  const [totalsRes, unisRes] = await Promise.all([
    // El orden lo pone `sortTeams`: el winrate no es una columna de esta vista
    // y ordenar por victorias deja a un 3–3 arriba de un 2–0.
    supabase.from('team_totals').select('*'),
    // Las siglas alcanzan: el archivo del escudo sale del tag. Ver UniversityLogo.
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
          {/* Mismo tratamiento que estadísticas, tablas y admin: al cambiar de
              sección el título no tiene que cambiar de tamaño ni de caja. */}
          <h1 className="font-display text-3xl uppercase tracking-tight">Equipos</h1>
          {/*
            Como se vinculan las partidas con los equipos es una regla de la
            ingesta: le sirve a quien administra y a nadie mas. Un visitante
            quiere saber cuantos equipos hay.
          */}
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

      {/* Arriba de las cards y no en el encabezado: al lado de lo que ordena, y
          sin pelearle el lugar a los botones del panel. Con la lista vacía no
          hay nada que ordenar. */}
      {teams.length > 0 && <TeamOrderPicker order={order} />}

      {teams.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line-strong px-6 py-12 text-center text-fg-soft">
          <p>Todavía no hay equipos.</p>
          {/* "Detectar desde las partidas" es un boton del panel: sin sesion no
              existe, asi que nombrarlo manda a buscar algo que no esta. */}
          <p className="mt-1 text-sm text-faint">
            {user
              ? 'Probá con “Detectar desde las partidas”: agrupa a los jugadores por quiénes jugaron juntos.'
              : `Los equipos se publican antes del arranque, el ${tournamentStartDate()}.`}
          </p>
        </div>
      ) : (
        /*
          Cards y no una lista de renglones. Con veinte equipos, cuatro numeros
          y el nombre, la lista dejaba media pantalla vacia a la derecha y no
          habia donde poner el escudo sin apretarlo contra el texto. En la card
          el escudo entra grande y arriba, que es lo que hace reconocible al
          equipo de un vistazo: "Equipo 15" no lo hace.

          Van los escudos de las tres universidades de los equipos mixtos: aca
          hay lugar, a diferencia del fixture.
        */
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((team) => {
            const tags = universities.get(team.team_id) ?? []
            const losses = team.games - team.wins

            return (
              <li key={team.team_id}>
                <Link
                  href={`/equipos/${team.team_id}`}
                  className="flex h-full flex-col gap-3 border-2 border-line bg-surface p-4 transition-colors hover:border-accent"
                >
                  {/*
                    Arriba, el equipo a la izquierda y sus escudos a la derecha;
                    abajo, los numeros cruzando la card entera.

                    Los escudos van a 48px porque a ese tamano los tres de un
                    equipo mixto ocupan 152 y entran hasta en la card mas angosta
                    —un telefono a una columna, 280px de contenido—, donde le
                    quedan 116 al nombre y "Equipo 15" necesita 63. La linea de
                    siglas se trunca ahi, pero es justo el caso en que los tres
                    escudos ya dicen lo mismo.
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

                  {/* mt-auto: las cards de una fila miden lo mismo, asi que
                      los numeros quedan abajo aunque un nombre ocupe dos. */}
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
                        {team.games > 0 ? `${Math.round((team.wins / team.games) * 100)}%` : '—'}
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
