import Link from 'next/link'
import { DamageBar } from './DamageBar'
import { GameIcon } from './GameIcon'
import { championIcon, championName, itemIcon, spellIcon } from '@/lib/ddragon'
import { formatGold, formatKda, formatPosition, playerName, riotTag } from '@/lib/format'
import { matchOrigin, playerPath, teamPath } from '@/lib/routes'
import type { MatchTeamStatsRow } from '@/types/db'

export interface ScoreboardPlayer {
  matchPlayerId: string
  side: 100 | 200
  /** null for an account the ingest could not resolve: there is no page to go to. */
  playerId: string | null
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
  teamId,
  matchId,
  players,
  stats,
  version,
  spellNames,
  championNames,
  maxDamage,
}: {
  side: 100 | 200
  teamName: string | null
  /** null while the match has no matchup assigned: then the name is not a link. */
  teamId: string | null
  /** Where the team's page has to come back to. */
  matchId: string
  players: ScoreboardPlayer[]
  stats: MatchTeamStatsRow | undefined
  version: string
  spellNames: Record<string, string>
  championNames: Record<string, string>
  maxDamage: number
}) {
  const isBlue = side === 100
  const won = stats?.win ?? false
  const accent = isBlue ? 'text-side-blue' : 'text-side-red'
  const edge = isBlue ? 'border-l-side-blue' : 'border-l-side-red'
  const badge = isBlue ? 'bg-side-blue-dim text-side-blue' : 'bg-side-red-dim text-side-red'

  return (
    <section className={`overflow-hidden rounded-lg border border-line border-l-2 ${edge}`}>
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 bg-surface px-4 py-3">
        {/*
          The team's name leads to its page. It is the first thing anyone reads
          on a scoreboard and it was dead text: to see who else is in that team
          you had to go to /equipos and find it by name. The `desde` brings the
          arrow back to this match, which is where the reading was.
        */}
        <h2 className={`font-semibold ${accent}`}>
          {teamId ? (
            <Link href={teamPath(teamId, matchOrigin(matchId))} className="hover:underline">
              {teamName ?? (isBlue ? 'Lado azul' : 'Lado rojo')}
            </Link>
          ) : (
            (teamName ?? (isBlue ? 'Lado azul' : 'Lado rojo'))
          )}
        </h2>
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium ${
            won ? badge : 'bg-raised text-loss'
          }`}
        >
          {won ? 'Victoria' : 'Derrota'}
        </span>

        <div className="tabular ml-auto flex gap-4 text-xs text-muted">
          <span>
            <strong className="text-fg">{stats?.kills ?? 0}</strong> kills
          </span>
          <span>
            <strong className="text-fg">{formatGold(stats?.gold ?? 0)}</strong> oro
          </span>
          <span className="hidden sm:inline">
            <strong className="text-fg">{stats?.turrets ?? 0}</strong> torres
          </span>
          <span className="hidden sm:inline">
            <strong className="text-fg">{stats?.dragons ?? 0}</strong> dragones
          </span>
          <span className="hidden md:inline">
            <strong className="text-fg">{stats?.barons ?? 0}</strong> barones
          </span>
        </div>
      </header>

      {/* `tabla-scroll` marks the right edge while there is table left on that
          side: it is 52rem of minimum width and on a phone there is no
          scrollbar to say so. The same class SortableTable uses. */}
      <div className="tabla-scroll overflow-x-auto">
        <table className="w-full min-w-[52rem] text-sm">
          {/* SortableTable had the `scope` and the `caption` and this one did
              not: without them a screen reader reads eight loose numbers with
              no way of saying which column each belongs to. */}
          <caption className="sr-only">Estadísticas por jugador</caption>
          <thead>
            <tr className="border-y border-line text-left text-xs text-faint">
              <th scope="col" className="px-4 py-2 font-medium">
                Jugador
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                KDA
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                KP
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                CS
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                Oro
              </th>
              <th scope="col" className="px-2 py-2 font-medium">
                Daño
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                Visión
              </th>
              <th scope="col" className="px-4 py-2 font-medium">
                Objetos
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {players.map((player) => (
              <tr key={player.matchPlayerId} className="hover:bg-surface/60">
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <GameIcon
                      src={championIcon(version, player.champion)}
                      alt={championName(championNames, player.champion)}
                      size={34}
                    />
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
                            className="rounded bg-accent-strong px-1 text-[10px] font-bold text-white"
                          >
                            MVP
                          </span>
                        )}
                        {/*
                          Same as the team: the name of whoever played is the
                          way into their page, which is where their history and
                          their champion pool live. The row is not a link whole
                          because it already holds eight other things - items,
                          spells, the champion - and a link over all of it
                          swallows every one of them.
                        */}
                        {player.playerId ? (
                          <Link
                            href={playerPath(player.playerId)}
                            className="truncate hover:underline"
                          >
                            {playerName(player.riotGameName)}
                          </Link>
                        ) : (
                          playerName(player.riotGameName)
                        )}
                        {riotTag(player.riotGameName, player.riotTagLine) && (
                          <span className="shrink-0 text-xs font-normal text-faint">
                            {riotTag(player.riotGameName, player.riotTagLine)}
                          </span>
                        )}
                      </p>
                      <p className="truncate text-xs text-faint">
                        {championName(championNames, player.champion)} ·{' '}
                        {formatPosition(player.position)}
                      </p>
                    </div>
                  </div>
                </td>

                <td className="tabular px-2 py-2 text-right">
                  <p>{formatKda(player.kills, player.deaths, player.assists)}</p>
                  <p className="text-xs text-faint">{player.kda.toFixed(2)}</p>
                </td>

                <td className="tabular px-2 py-2 text-right text-fg-soft">
                  {Math.round(player.killParticipation * 100)}%
                </td>

                <td className="tabular px-2 py-2 text-right">
                  <p>{player.cs}</p>
                  <p className="text-xs text-faint">{player.csm.toFixed(1)}/min</p>
                </td>

                <td className="tabular px-2 py-2 text-right text-fg-soft">
                  {formatGold(player.goldEarned)}
                </td>

                <td className="px-2 py-2">
                  <DamageBar
                    damage={player.damageToChampions}
                    max={maxDamage}
                    side={player.side}
                  />
                </td>

                <td className="tabular px-2 py-2 text-right text-fg-soft">{player.visionScore}</td>

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
