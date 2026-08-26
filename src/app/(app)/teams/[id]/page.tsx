import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatNumber, riotId } from '@/lib/format'
import type { PlayerTotalsRow } from '@/types/db'
import { addPlayerAction, deleteTeamAction, removePlayerAction } from '../actions'

export const dynamic = 'force-dynamic'

interface MemberRow {
  player_id: string
  players: { id: string; puuid: string; riot_game_name: string | null; riot_tag_line: string | null }
}

export default async function TeamPage({ params }: PageProps<'/teams/[id]'>) {
  await requireUser()
  const { id } = await params

  const supabase = await createClient()
  const [teamRes, membersRes, totalsRes] = await Promise.all([
    supabase.from('teams').select('id,name,tag').eq('id', id).maybeSingle(),
    supabase
      .from('team_members')
      .select('player_id,players(id,puuid,riot_game_name,riot_tag_line)')
      .eq('team_id', id)
      .is('left_at', null),
    supabase.from('player_totals').select('*').order('games', { ascending: false }),
  ])

  const team = teamRes.data as { id: string; name: string; tag: string | null } | null
  if (!team) notFound()

  const members = (membersRes.data ?? []) as unknown as MemberRow[]
  const totals = (totalsRes.data ?? []) as PlayerTotalsRow[]
  const memberIds = new Set(members.map((m) => m.player_id))

  const statsByPlayer = new Map(totals.filter((t) => t.player_id).map((t) => [t.player_id!, t]))
  // Sin equipo asignado y con partidas jugadas: los candidatos a sumar.
  const available = totals.filter((t) => t.player_id && !memberIds.has(t.player_id) && !t.team_id)

  return (
    <div className="flex flex-col gap-6">
      <Link href="/teams" className="text-sm text-ink-400 transition-colors hover:text-white">
        ← Equipos
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">{team.name}</h1>
        <form action={deleteTeamAction}>
          <input type="hidden" name="teamId" value={team.id} />
          <button
            type="submit"
            className="rounded border border-ink-700 px-3 py-1.5 text-sm text-ink-400 transition-colors hover:border-brand-red hover:text-brand-red-soft"
          >
            Eliminar equipo
          </button>
        </form>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-ink-400">Roster ({members.length})</h2>
        {members.length === 0 ? (
          <p className="rounded-lg border border-dashed border-ink-700 px-4 py-8 text-center text-sm text-ink-500">
            Todavía no hay jugadores en este equipo.
          </p>
        ) : (
          <ul className="divide-y divide-ink-800 rounded-lg border border-ink-800">
            {members.map((member) => {
              const stats = statsByPlayer.get(member.player_id)
              return (
                <li key={member.player_id} className="flex items-center gap-4 px-4 py-2.5 text-sm">
                  <Link
                    href={`/players/${member.player_id}`}
                    className="flex-1 truncate font-medium transition-colors hover:text-brand-aqua"
                  >
                    {riotId(member.players?.riot_game_name, member.players?.riot_tag_line)}
                  </Link>
                  {stats && (
                    <>
                      <span className="tabular w-20 text-right text-ink-500">
                        {stats.games} partidas
                      </span>
                      <span className="tabular w-16 text-right text-ink-400">
                        {stats.kda} KDA
                      </span>
                    </>
                  )}
                  <form action={removePlayerAction}>
                    <input type="hidden" name="teamId" value={team.id} />
                    <input type="hidden" name="playerId" value={member.player_id} />
                    <button
                      type="submit"
                      className="text-xs text-ink-500 transition-colors hover:text-brand-red-soft"
                    >
                      Quitar
                    </button>
                  </form>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-ink-400">
          Agregar jugador ({available.length} sin equipo)
        </h2>
        <ul className="max-h-96 divide-y divide-ink-800 overflow-y-auto rounded-lg border border-ink-800">
          {available.map((player) => (
            <li key={player.puuid} className="flex items-center gap-4 px-4 py-2 text-sm">
              <span className="flex-1 truncate">
                {riotId(player.riot_game_name, player.riot_tag_line)}
              </span>
              <span className="tabular w-20 text-right text-ink-500">{player.games} partidas</span>
              <span className="tabular hidden w-24 text-right text-ink-500 sm:inline">
                {formatNumber(player.avg_damage)} daño
              </span>
              <form action={addPlayerAction}>
                <input type="hidden" name="teamId" value={team.id} />
                <input type="hidden" name="playerId" value={player.player_id ?? ''} />
                <button
                  type="submit"
                  className="text-xs text-brand-aqua transition-colors hover:text-brand-aqua-soft"
                >
                  Agregar
                </button>
              </form>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
