import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatNumber, riotId } from '@/lib/format'
import type { PlayerTotalsRow } from '@/types/db'

export const dynamic = 'force-dynamic'

export default async function PlayersPage() {
  await requireUser()

  const supabase = await createClient()
  const [totalsRes, teamsRes] = await Promise.all([
    supabase.from('player_totals').select('*'),
    supabase.from('teams').select('id,name'),
  ])

  const players = ((totalsRes.data ?? []) as PlayerTotalsRow[]).sort(
    (a, b) => b.mvp_count - a.mvp_count || b.games - a.games,
  )
  const teamNames = new Map(
    ((teamsRes.data ?? []) as { id: string; name: string }[]).map((t) => [t.id, t.name]),
  )

  const sinEquipo = players.filter((p) => !p.team_id).length

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Jugadores</h1>
          <p className="mt-1 text-sm text-ink-400">
            {players.length} detectados en las partidas · {sinEquipo} sin equipo asignado
          </p>
        </div>
        <Link
          href="/teams"
          className="rounded border border-ink-700 px-4 py-2 text-sm transition-colors hover:border-ink-500"
        >
          Administrar equipos
        </Link>
      </div>

      <div className="overflow-x-auto rounded-lg border border-ink-800">
        <table className="w-full min-w-[48rem] text-sm">
          <thead>
            <tr className="border-b border-ink-800 text-left text-xs text-ink-500">
              <th className="px-4 py-2 font-medium">Jugador</th>
              <th className="px-3 py-2 font-medium">Equipo</th>
              <th className="px-3 py-2 text-right font-medium">Partidas</th>
              <th className="px-3 py-2 text-right font-medium">Victorias</th>
              <th className="px-3 py-2 text-right font-medium">KDA</th>
              <th className="px-3 py-2 text-right font-medium">Promedio</th>
              <th className="px-3 py-2 text-right font-medium">Daño</th>
              <th className="px-3 py-2 text-right font-medium">Visión</th>
              <th className="px-4 py-2 text-right font-medium">MVP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-800">
            {players.map((player) => (
              <tr key={player.puuid} className="hover:bg-ink-900/60">
                <td className="px-4 py-2 font-medium">
                  {player.player_id ? (
                    <Link
                      href={`/players/${player.player_id}`}
                      className="transition-colors hover:text-brand-aqua"
                    >
                      {player.display_name ?? riotId(player.riot_game_name, player.riot_tag_line)}
                    </Link>
                  ) : (
                    player.display_name ?? riotId(player.riot_game_name, player.riot_tag_line)
                  )}
                </td>
                <td className="px-3 py-2 text-ink-400">
                  {player.team_id ? (
                    <Link
                      href={`/teams/${player.team_id}`}
                      className="transition-colors hover:text-brand-aqua"
                    >
                      {teamNames.get(player.team_id) ?? 'Equipo'}
                    </Link>
                  ) : (
                    <span className="text-ink-600">sin equipo</span>
                  )}
                </td>
                <td className="tabular px-3 py-2 text-right">{player.games}</td>
                <td className="tabular px-3 py-2 text-right text-ink-400">
                  {player.wins}
                  <span className="ml-1 text-xs text-ink-600">
                    {player.games > 0 ? `${Math.round((player.wins / player.games) * 100)}%` : ''}
                  </span>
                </td>
                <td className="tabular px-3 py-2 text-right">{player.kda}</td>
                <td className="tabular px-3 py-2 text-right text-ink-400">
                  {player.avg_kills}/{player.avg_deaths}/{player.avg_assists}
                </td>
                <td className="tabular px-3 py-2 text-right text-ink-400">
                  {formatNumber(player.avg_damage)}
                </td>
                <td className="tabular px-3 py-2 text-right text-ink-400">{player.avg_vision}</td>
                <td className="tabular px-4 py-2 text-right">
                  {player.mvp_count > 0 ? (
                    <span className="rounded bg-brand-red px-1.5 py-0.5 text-xs font-bold text-white">
                      {player.mvp_count}
                    </span>
                  ) : (
                    <span className="text-ink-700">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
