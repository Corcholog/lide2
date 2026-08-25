import { GameIcon } from './GameIcon'
import { championIcon, itemIcon, spellIcon } from '@/lib/ddragon'
import { formatGold, formatKda, formatNumber, formatPosition, riotId } from '@/lib/format'
import type { MatchTeamStatsRow } from '@/types/db'

export interface ScoreboardPlayer {
  matchPlayerId: string
  side: 100 | 200
  champion: string
  position: string | null
  riotGameName: string | null
  riotTagLine: string | null
  kills: number
  deaths: number
  assists: number
  kda: number
  killParticipation: number
  cs: number
  csm: number
  goldEarned: number
  damageToChampions: number
  damageShare: number
  visionScore: number
  items: number[]
  summonerSpell1: string | null
  summonerSpell2: string | null
  isMvp: boolean
}

export function Scoreboard({
  side,
  teamName,
  players,
  stats,
  version,
  spellNames,
  maxDamage,
}: {
  side: 100 | 200
  teamName: string | null
  players: ScoreboardPlayer[]
  stats: MatchTeamStatsRow | undefined
  version: string
  spellNames: Record<string, string>
  maxDamage: number
}) {
  const isBlue = side === 100
  const won = stats?.win ?? false
  const accent = isBlue ? 'text-brand-aqua' : 'text-brand-red-soft'
  const bar = isBlue ? 'bg-brand-aqua-fill' : 'bg-brand-red-fill'
  const edge = isBlue ? 'border-l-brand-aqua' : 'border-l-brand-red'

  return (
    <section className={`overflow-hidden rounded-lg border border-ink-800 border-l-2 ${edge}`}>
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 bg-ink-900 px-4 py-3">
        <h2 className={`font-semibold ${accent}`}>
          {teamName ?? (isBlue ? 'Lado azul' : 'Lado rojo')}
        </h2>
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium ${
            won ? 'bg-brand-aqua-dim text-brand-aqua' : 'bg-ink-800 text-ink-400'
          }`}
        >
          {won ? 'Victoria' : 'Derrota'}
        </span>

        <div className="tabular ml-auto flex gap-4 text-xs text-ink-400">
          <span>
            <strong className="text-ink-200">{stats?.kills ?? 0}</strong> kills
          </span>
          <span>
            <strong className="text-ink-200">{formatGold(stats?.gold ?? 0)}</strong> oro
          </span>
          <span className="hidden sm:inline">
            <strong className="text-ink-200">{stats?.turrets ?? 0}</strong> torres
          </span>
          <span className="hidden sm:inline">
            <strong className="text-ink-200">{stats?.dragons ?? 0}</strong> dragones
          </span>
          <span className="hidden md:inline">
            <strong className="text-ink-200">{stats?.barons ?? 0}</strong> barones
          </span>
        </div>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[52rem] text-sm">
          <thead>
            <tr className="border-y border-ink-800 text-left text-xs text-ink-500">
              <th className="px-4 py-2 font-medium">Jugador</th>
              <th className="px-2 py-2 text-right font-medium">KDA</th>
              <th className="px-2 py-2 text-right font-medium">KP</th>
              <th className="px-2 py-2 text-right font-medium">CS</th>
              <th className="px-2 py-2 text-right font-medium">Oro</th>
              <th className="px-2 py-2 font-medium">Daño</th>
              <th className="px-2 py-2 text-right font-medium">Visión</th>
              <th className="px-4 py-2 font-medium">Objetos</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-800">
            {players.map((player) => (
              <tr key={player.matchPlayerId} className="hover:bg-ink-900/60">
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <GameIcon src={championIcon(version, player.champion)} alt={player.champion} size={34} />
                    <div className="flex shrink-0 flex-col gap-0.5">
                      <GameIcon
                        src={spellIcon(version, spellNames[player.summonerSpell1 ?? ''])}
                        alt="Hechizo 1"
                        size={16}
                      />
                      <GameIcon
                        src={spellIcon(version, spellNames[player.summonerSpell2 ?? ''])}
                        alt="Hechizo 2"
                        size={16}
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="flex items-center gap-1 truncate font-medium">
                        {player.isMvp && (
                          <span
                            title="MVP de la partida"
                            className="rounded bg-brand-red px-1 text-[10px] font-bold text-white"
                          >
                            MVP
                          </span>
                        )}
                        {riotId(player.riotGameName, player.riotTagLine)}
                      </p>
                      <p className="truncate text-xs text-ink-500">
                        {player.champion} · {formatPosition(player.position)}
                      </p>
                    </div>
                  </div>
                </td>

                <td className="tabular px-2 py-2 text-right">
                  <p>{formatKda(player.kills, player.deaths, player.assists)}</p>
                  <p className="text-xs text-ink-500">{player.kda.toFixed(2)}</p>
                </td>

                <td className="tabular px-2 py-2 text-right text-ink-300">
                  {Math.round(player.killParticipation * 100)}%
                </td>

                <td className="tabular px-2 py-2 text-right">
                  <p>{player.cs}</p>
                  <p className="text-xs text-ink-500">{player.csm.toFixed(1)}/min</p>
                </td>

                <td className="tabular px-2 py-2 text-right text-ink-300">
                  {formatGold(player.goldEarned)}
                </td>

                <td className="px-2 py-2">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-ink-800">
                      <div
                        className={`h-full rounded-r-[4px] ${bar}`}
                        style={{
                          width: `${maxDamage > 0 ? (player.damageToChampions / maxDamage) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <span className="tabular text-xs text-ink-400">
                      {formatNumber(player.damageToChampions)}
                    </span>
                  </div>
                </td>

                <td className="tabular px-2 py-2 text-right text-ink-300">{player.visionScore}</td>

                <td className="px-4 py-2">
                  <div className="flex gap-0.5">
                    {player.items.map((item, index) => (
                      <GameIcon
                        key={`${player.matchPlayerId}-${index}`}
                        src={itemIcon(version, item)}
                        alt={item > 0 ? `Objeto ${item}` : 'Vacío'}
                        size={22}
                      />
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
