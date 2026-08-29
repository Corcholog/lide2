import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AddAccount } from '@/components/admin/AddAccount'
import {
  LogoUniversidad,
  LogosUniversidad,
} from '@/components/torneo/LogoUniversidad'
import { getUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { maybeRow, rows } from '@/lib/supabase/query'
import { TOURNAMENT } from '@/lib/lide2/tournament'
import { formatNumber, formatPosition, playerName } from '@/lib/format'
import type { PlayerTotalsRow, TeamLineupRow } from '@/types/db'
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
  const [teamRes, lineupRes, totalsRes, rosterRes, unisRes] = await Promise.all([
    supabase.from('teams').select('id,name,tag').eq('id', id).maybeSingle(),
    // El plantel son casilleros y no cuentas: los cinco roles están siempre, el
    // banco sale de cuántos anotó el equipo y el nick aparece cuando la persona
    // jugó y quedó emparejada. Ver 0014_plantel.sql.
    supabase.from('team_lineup').select('*').eq('team_id', id).order('slot'),
    supabase.from('player_totals').select('*').order('games', { ascending: false }),
    supabase
      .from('team_roster')
      .select('id,full_name,display_name,order_index,player_id,universities(tag)')
      .eq('team_id', id)
      .order('order_index'),
    // Las universidades que representa el equipo, la principal primero. La
    // mayoria tiene una; los cuatro equipos armados con inscripciones sueltas
    // tienen hasta tres. `team_universities` es de lectura publica, asi que
    // esto tambien se ve sin sesion.
    supabase
      .from('team_universities')
      .select('order_index,universities(tag,name)')
      .eq('team_id', id)
      .order('order_index'),
  ])

  const team = maybeRow<{ id: string; name: string; tag: string | null }>(teamRes, 'el equipo')
  if (!team) notFound()

  const universidades = rows<{ universities: { tag: string; name: string } | null }>(
    unisRes as never,
    'las universidades del equipo',
  ).flatMap((fila) => (fila.universities ? [fila.universities] : []))

  const lineup = rows<TeamLineupRow>(lineupRes, 'el plantel')
  const roster = rows<RosterRow>(rosterRes as never, 'los inscriptos')
  const totals = rows<PlayerTotalsRow>(totalsRes, 'los totales por jugador')
  const memberIds = new Set(lineup.flatMap((slot) => (slot.player_id ? [slot.player_id] : [])))
  const confirmados = memberIds.size

  const statsByPlayer = new Map(totals.map((t) => [t.player_id, t]))
  // Sin equipo asignado y con partidas jugadas: los candidatos a sumar.
  const available = totals.filter((t) => !memberIds.has(t.player_id) && !t.team_id)

  return (
    <div className="flex flex-col gap-6">
      <Link href="/equipos" className="text-sm text-muted transition-colors hover:text-fg">
        ← Equipos
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-3">
          <LogosUniversidad tags={universidades.map((u) => u.tag)} size="xl" max={3} />
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">{team.name}</h1>
            {/* "Equipo 15" no dice de quien es: el nombre largo si. */}
            {universidades.length > 0 && (
              <p className="mt-1 text-sm text-muted">
                {universidades.map((u) => u.name).join(' · ')}
              </p>
            )}
          </div>
        </div>
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
            {roster.map((entry, index) => (
              <li key={entry.id} className="flex items-center gap-4 px-4 py-2 text-sm">
                {/* La posición en la lista y no `order_index`: ese es el orden
                    de la planilla y queda con huecos cuando alguien se da de
                    baja desde el panel. */}
                <span className="tabular w-5 shrink-0 text-right text-xs text-dim">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {entry.display_name ?? entry.full_name}
                </span>
                {entry.universities?.tag && (
                  <span className="flex shrink-0 items-center gap-1.5">
                    <LogoUniversidad tag={entry.universities.tag} size="xs" />
                    <span className="text-xs text-faint">{entry.universities.tag}</span>
                  </span>
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
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-sm font-medium text-muted">Plantel</h2>
          {confirmados < lineup.length && (
            <span className="text-xs text-dim">
              {confirmados} de {lineup.length} nicks
            </span>
          )}
        </div>
        {/*
          Un lugar vacío se muestra igual, con el nombre del rol. El plantel de
          un equipo del que todavía no se subió ningún replay son cinco líneas
          en gris, y se van llenando solas a medida que entran las partidas.
        */}
        <ul className="divide-y divide-line rounded-lg border border-line">
          {lineup.map((slot) => {
            const stats = slot.player_id ? statsByPlayer.get(slot.player_id) : null
            return (
              <li key={slot.slot} className="flex items-center gap-4 px-4 py-2.5 text-sm">
                <span className="w-20 shrink-0 text-xs text-faint">
                  {slot.role ? formatPosition(slot.role) : `Suplente ${slot.sub_number}`}
                </span>
                {slot.player_id ? (
                  <Link
                    href={`/jugadores/${slot.player_id}`}
                    className="min-w-0 flex-1 truncate font-medium transition-colors hover:text-accent"
                  >
                    {playerName(slot.name)}
                  </Link>
                ) : (
                  <span className="min-w-0 flex-1 truncate text-dim">Por confirmar</span>
                )}
                {stats && (
                  <>
                    <span className="tabular w-20 text-right text-faint">
                      {stats.games} partidas
                    </span>
                    <span className="tabular w-16 text-right text-muted">{stats.kda} KDA</span>
                  </>
                )}
                {user && slot.player_id && (
                  <form action={removePlayerAction}>
                    <input type="hidden" name="teamId" value={team.id} />
                    <input type="hidden" name="playerId" value={slot.player_id} />
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
      </section>

      {user && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted">
            Agregar jugador ({available.length} sin equipo)
          </h2>
          {/*
            Dos puertas, y la de arriba es la única que funciona antes de que se
            juegue algo: la lista de abajo son cuentas detectadas en los
            replays, así que en la fecha 0 está vacía para todos los equipos.
          */}
          <AddAccount teamId={team.id} />
          <p className="text-xs text-dim">
            Si esa persona todavía no jugó, escribí su nick igual: la cuenta queda cargada sin
            partidas y se engancha sola con su primer replay. La lista de abajo son las cuentas
            que ya jugaron y no están en ningún equipo.
          </p>
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
