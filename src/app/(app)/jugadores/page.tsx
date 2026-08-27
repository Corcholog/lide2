import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatNumber, playerName } from '@/lib/format'
import type { PlayerTotalsRow } from '@/types/db'

export const dynamic = 'force-dynamic'

export default async function PlayersPage() {
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
          <p className="mt-1 text-sm text-muted">
            {players.length} detectados en las partidas · {sinEquipo} sin equipo asignado
          </p>
        </div>
        <Link
          href="/equipos"
          className="rounded border border-line-strong px-4 py-2 text-sm transition-colors hover:border-accent"
        >
          Administrar equipos
        </Link>
      </div>

      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[48rem] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-faint">
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
          <tbody className="divide-y divide-line">
            {players.map((player) => (
              <tr key={player.player_id} className="hover:bg-surface/60">
                <td className="px-4 py-2 font-medium">
                  <Link
                    href={`/jugadores/${player.player_id}`}
                    className="transition-colors hover:text-accent"
                  >
                    {playerName(player.riot_game_name, player.display_name)}
                  </Link>
                </td>
                <td className="px-3 py-2 text-muted">
                  {player.team_id ? (
                    <Link
                      href={`/equipos/${player.team_id}`}
                      className="transition-colors hover:text-accent"
                    >
                      {teamNames.get(player.team_id) ?? 'Equipo'}
                    </Link>
                  ) : (
                    <span className="text-dim">sin equipo</span>
                  )}
                </td>
                <td className="tabular px-3 py-2 text-right">{player.games}</td>
                <td className="tabular px-3 py-2 text-right text-muted">
                  {player.wins}
                  <span className="ml-1 text-xs text-dim">
                    {player.games > 0 ? `${Math.round((player.wins / player.games) * 100)}%` : ''}
                  </span>
                </td>
                <td className="tabular px-3 py-2 text-right">{player.kda}</td>
                <td className="tabular px-3 py-2 text-right text-muted">
                  {player.avg_kills}/{player.avg_deaths}/{player.avg_assists}
                </td>
                <td className="tabular px-3 py-2 text-right text-muted">
                  {formatNumber(player.avg_damage)}
                </td>
                <td className="tabular px-3 py-2 text-right text-muted">{player.avg_vision}</td>
                <td className="tabular px-4 py-2 text-right">
                  {player.mvp_count > 0 ? (
                    <span className="rounded bg-accent-strong px-1.5 py-0.5 text-xs font-bold text-white">
                      {player.mvp_count}
                    </span>
                  ) : (
                    <span className="text-dim">—</span>
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
