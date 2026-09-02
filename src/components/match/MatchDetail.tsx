import Link from 'next/link'
import { DamageBar } from '@/components/match/DamageBar'
import { GameIcon } from '@/components/match/GameIcon'
import { championIcon, championName } from '@/lib/ddragon'
import { formatGold, formatKda, playerName, riotTag } from '@/lib/format'
import type { MatchTeamStatsRow } from '@/types/db'
import { playerPath } from '@/lib/routes'

/**
 * What shows when a match in the listing is expanded.
 *
 * It is a compact scoreboard: the ten players with what gets looked at first -
 * champion, KDA, damage, CS, gold - and each team's objectives. It is enough to
 * know what happened without leaving the list, which is what people do when
 * going over a whole matchday.
 *
 * IT DOES NOT REUSE `Scoreboard`: that one asks for items and spells, which is
 * seven more icons per player plus the matching columns of the view. Across
 * sixty preloaded matches that is fetching and drawing something nobody looks
 * at here; the match page, one click further down, is there for that.
 */

/** The minimum of a player for the detail. No items or spells, on purpose. */
export interface DetailPlayer {
  matchPlayerId: string
  side: 100 | 200
  playerId: string | null
  champion: string
  position: string | null
  riotGameName: string | null
  riotTagLine: string | null
  kills: number
  deaths: number
  assists: number
  killParticipation: number
  cs: number
  csm: number
  goldEarned: number
  damageToChampions: number
  visionScore: number
  isMvp: boolean
}

export function MatchDetail({
  matchId,
  players,
  teamStats,
  teamNames,
  version,
  championNames: names,
}: {
  matchId: string
  players: DetailPlayer[]
  /** Each side's totals, for the objectives. */
  teamStats: Map<100 | 200, MatchTeamStatsRow>
  teamNames: { 100: string; 200: string }
  version: string
  championNames: Record<string, string>
}) {
  // The bar's scale is the maximum of THIS match, as on the match page.
  const maxDamage = Math.max(...players.map((player) => player.damageToChampions), 0)

  return (
    <div className="flex flex-col gap-4 border-t-2 border-line px-4 py-4">
      <div className="grid gap-4 lg:grid-cols-2">
        {([100, 200] as const).map((side) => (
          <Side
            key={side}
            side={side}
            name={teamNames[side]}
            stats={teamStats.get(side)}
            players={players.filter((player) => player.side === side)}
            maxDamage={maxDamage}
            version={version}
            championNames={names}
          />
        ))}
      </div>

      <Link
        href={`/partidas/${matchId}`}
        className="self-start text-xs font-bold uppercase tracking-wide text-muted transition-colors hover:text-accent"
      >
        Ficha completa →
      </Link>
    </div>
  )
}

/* Each side's tones, in whole: Tailwind cannot see a class built at runtime. */
const SIDE_TONE = {
  100: { text: 'text-side-blue', border: 'border-l-side-blue' },
  200: { text: 'text-side-red', border: 'border-l-side-red' },
} as const

function Side({
  side,
  name,
  stats,
  players,
  maxDamage,
  version,
  championNames: names,
}: {
  side: 100 | 200
  name: string
  stats: MatchTeamStatsRow | undefined
  players: DetailPlayer[]
  maxDamage: number
  version: string
  championNames: Record<string, string>
}) {
  const tone = SIDE_TONE[side]

  return (
    <section className={`border-2 border-line border-l-4 ${tone.border}`}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-surface px-3 py-2">
        <h3 className={`text-sm font-bold ${tone.text}`}>{name}</h3>
        <span className={`text-xs ${stats?.win ? 'text-win' : 'text-loss'}`}>
          {stats?.win ? 'Victoria' : 'Derrota'}
        </span>

        <div className="tabular ml-auto flex flex-wrap gap-x-3 text-xs text-muted">
          <span>
            <strong className="text-fg">{stats?.turrets ?? 0}</strong> torres
          </span>
          <span>
            <strong className="text-fg">{stats?.dragons ?? 0}</strong> drag.
          </span>
          <span>
            <strong className="text-fg">{stats?.barons ?? 0}</strong> barones
          </span>
          <span className="hidden sm:inline">
            <strong className="text-fg">{stats?.heralds ?? 0}</strong> heraldos
          </span>
        </div>
      </header>

      <ul className="divide-y divide-line">
        {players.map((player) => {
          const champion = championName(names, player.champion)

          return (
            <li
              key={player.matchPlayerId}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm"
            >
              <GameIcon src={championIcon(version, player.champion)} alt={champion} size={28} />

              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 truncate">
                  {player.isMvp && (
                    <span
                      title="MVP de la partida"
                      className="bg-accent-strong px-1 text-[10px] font-bold text-white"
                    >
                      MVP
                    </span>
                  )}
                  {player.playerId ? (
                    <Link
                      href={playerPath(player.playerId)}
                      className="truncate font-medium transition-colors hover:text-accent"
                    >
                      {playerName(player.riotGameName)}
                    </Link>
                  ) : (
                    <span className="truncate font-medium">
                      {playerName(player.riotGameName)}
                    </span>
                  )}
                  {riotTag(player.riotGameName, player.riotTagLine) && (
                    <span className="shrink-0 text-xs text-faint">
                      {riotTag(player.riotGameName, player.riotTagLine)}
                    </span>
                  )}
                </p>
                {/*
                  The champion alone: the lane each one plays is already said by
                  the order of the list - top at the top, support at the bottom,
                  the same in both columns - so repeating it on every row says
                  the same thing twice and takes room from the name.
                */}
                <p className="truncate text-xs text-faint">{champion}</p>
              </div>

              <div className="tabular w-16 shrink-0 text-right">
                <p>{formatKda(player.kills, player.deaths, player.assists)}</p>
                <p className="text-xs text-faint">
                  {Math.round(player.killParticipation * 100)}% KP
                </p>
              </div>

              <div className="tabular hidden w-16 shrink-0 text-right sm:block">
                <p>{player.cs} CS</p>
                <p className="text-xs text-faint">{formatGold(player.goldEarned)}</p>
              </div>

              <div className="hidden shrink-0 md:block">
                <DamageBar
                  damage={player.damageToChampions}
                  max={maxDamage}
                  side={side}
                  width="w-14"
                />
                <p className="tabular text-right text-xs text-faint">
                  {player.visionScore} visión
                </p>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
