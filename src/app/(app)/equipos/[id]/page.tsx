import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { maybeRow, rows } from '@/lib/supabase/query'
import { TOURNAMENT } from '@/lib/lide2/tournament'
import { formatNumber, playerName } from '@/lib/format'
import type { PlayerTotalsRow, TeamAccountRow } from '@/types/db'
import { addPlayerAction, deleteTeamAction, removePlayerAction } from '../actions'

export const dynamic = 'force-dynamic'

/**
 * Un inscripto de la planilla. Es otra cosa que un `player`: aca esta el nombre
 * de la persona y alla su cuenta de Riot. Se cruzan por player_id cuando alguien
 * los empareja.
 */
interface RosterRow {
  id: string
  full_name: string
  display_name: string | null
  order_index: number
  player_id: string | null
  universities: { tag: string } | null
}

/**
 * El título de la pestaña y de la vista previa al compartir.
 *
 * Consulta aparte y mínima —sólo el nombre— en vez de reusar la de la página:
 * el cliente de Supabase no pasa por `fetch`, así que Next no deduplica sola.
 * Es una lectura por clave primaria; sale más barato que cachear.
 */
export async function generateMetadata({ params }: PageProps<'/equipos/[id]'>) {
  const { id } = await params
  const { data } = await (await createClient()).from('teams').select('name').eq('id', id).maybeSingle()

  const nombre = (data?.name as string) ?? 'Equipo'
  return { title: nombre, description: `Plantel, récord y números de ${nombre} en la ${TOURNAMENT.name}.` }
}

export default async function TeamPage({ params }: PageProps<'/equipos/[id]'>) {
  // La ficha se ve sin sesión. Lo que se edita —y los nombres de los
  // inscriptos, que son nombres legales— no.
  const user = await getUser()
  const { id } = await params

  const supabase = await createClient()
  const [teamRes, membersRes, totalsRes, rosterRes] = await Promise.all([
    supabase.from('teams').select('id,name,tag').eq('id', id).maybeSingle(),
    // De `team_accounts` y no de `team_members` con un join a `players`: esa
    // tabla dejó de ser legible sin sesión porque su clave es el PUUID. La
    // vista devuelve lo mismo sin esa columna.
    supabase.from('team_accounts').select('*').eq('team_id', id),
    supabase.from('player_totals').select('*').order('games', { ascending: false }),
    supabase
      .from('team_roster')
      .select('id,full_name,display_name,order_index,player_id,universities(tag)')
      .eq('team_id', id)
      .order('order_index'),
  ])

  const team = maybeRow<{ id: string; name: string; tag: string | null }>(teamRes, 'el equipo')
  if (!team) notFound()

  const members = rows<TeamAccountRow>(membersRes, 'el roster del equipo')
  const roster = rows<RosterRow>(rosterRes as never, 'los inscriptos')
  const totals = rows<PlayerTotalsRow>(totalsRes, 'los totales por jugador')
  const memberIds = new Set(members.map((m) => m.player_id))

  const statsByPlayer = new Map(totals.map((t) => [t.player_id, t]))
  // Sin equipo asignado y con partidas jugadas: los candidatos a sumar.
  const available = totals.filter((t) => !memberIds.has(t.player_id) && !t.team_id)

  return (
    <div className="flex flex-col gap-6">
      <Link href="/equipos" className="text-sm text-muted transition-colors hover:text-fg">
        ← Equipos
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">{team.name}</h1>
        {user && (
          <form action={deleteTeamAction}>
            <input type="hidden" name="teamId" value={team.id} />
            <button
              type="submit"
              className="rounded border border-line-strong px-3 py-1.5 text-sm text-muted transition-colors hover:border-accent hover:text-accent"
            >
              Eliminar equipo
            </button>
          </form>
        )}
      </div>

      {user && roster.length > 0 && (
        <section className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-sm font-medium text-muted">Inscriptos ({roster.length})</h2>
            {/*
              Estos nombres no salen a la web publica: son nombres legales de una
              planilla de inscripcion, no apodos elegidos. La policy de
              team_roster es solo `authenticated`, ver 0008_rosters.sql.
            */}
            <span className="text-xs text-dim">Sólo visible con sesión</span>
          </div>
          <ul className="divide-y divide-line rounded-lg border border-line">
            {roster.map((entry) => (
              <li key={entry.id} className="flex items-center gap-4 px-4 py-2 text-sm">
                <span className="tabular w-5 shrink-0 text-right text-xs text-dim">
                  {entry.order_index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {entry.display_name ?? entry.full_name}
                </span>
                {entry.universities?.tag && (
                  <span className="shrink-0 text-xs text-faint">{entry.universities.tag}</span>
                )}
                <span className="w-24 shrink-0 text-right text-xs text-dim">
                  {entry.player_id ? 'cuenta enlazada' : 'sin enlazar'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted">Roster detectado ({members.length})</h2>
        {members.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line-strong px-4 py-8 text-center text-sm text-faint">
            Todavía no hay jugadores en este equipo.
          </p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {members.map((member) => {
              const stats = statsByPlayer.get(member.player_id)
              return (
                <li key={member.player_id} className="flex items-center gap-4 px-4 py-2.5 text-sm">
                  <Link
                    href={`/jugadores/${member.player_id}`}
                    className="flex-1 truncate font-medium transition-colors hover:text-accent"
                  >
                    {playerName(member.riot_game_name, member.name)}
                  </Link>
                  {stats && (
                    <>
                      <span className="tabular w-20 text-right text-faint">
                        {stats.games} partidas
                      </span>
                      <span className="tabular w-16 text-right text-muted">{stats.kda} KDA</span>
                    </>
                  )}
                  {user && (
                    <form action={removePlayerAction}>
                      <input type="hidden" name="teamId" value={team.id} />
                      <input type="hidden" name="playerId" value={member.player_id} />
                      <button
                        type="submit"
                        className="text-xs text-faint transition-colors hover:text-accent"
                      >
                        Quitar
                      </button>
                    </form>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {user && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted">
            Agregar jugador ({available.length} sin equipo)
          </h2>
          <ul className="max-h-96 divide-y divide-line overflow-y-auto rounded-lg border border-line">
            {available.map((player) => (
              <li key={player.player_id} className="flex items-center gap-4 px-4 py-2 text-sm">
                <span className="flex-1 truncate">
                  {playerName(player.riot_game_name, player.display_name)}
                </span>
                <span className="tabular w-20 text-right text-faint">{player.games} partidas</span>
                <span className="tabular hidden w-24 text-right text-faint sm:inline">
                  {formatNumber(player.avg_damage)} daño
                </span>
                <form action={addPlayerAction}>
                  <input type="hidden" name="teamId" value={team.id} />
                  <input type="hidden" name="playerId" value={player.player_id} />
                  <button
                    type="submit"
                    className="text-xs text-accent transition-colors hover:text-accent-soft"
                  >
                    Agregar
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
