import Link from 'next/link'
import { GameIcon } from '@/components/match/GameIcon'
import { MatchDetail } from '@/components/match/MatchDetail'
import { markRule } from '@/components/match/mark'
import { matchPlace } from '@/lib/matches'
import { scopesOf } from '@/lib/stats/scope'
import { championIcon, championName } from '@/lib/ddragon'
import { formatDate, formatDuration, formatKda } from '@/lib/format'
import { rulingLabel } from '@/lib/lide2/rulings'
import type { DetailPlayer } from '@/lib/matches'
import { teamPath, type Origin } from '@/lib/routes'
import type { MatchSummaryRow, MatchTeamStatsRow } from '@/types/db'

/**
 * Match rows that expand into both teams' scoreboards.
 *
 * The expander is a native `<details>`: no JavaScript, built-in keyboard and
 * `aria-expanded` support, and closed content is not rendered.
 *
 * Shared by /partidas, team pages and player pages; team pages underline their
 * team's side (see `markRule`).
 */

/**
 * The `match_summaries` columns a row reads. Keep it a single string literal:
 * supabase-js infers the result type from it, and a concatenation widens it to
 * `string`.
 */
export const LIST_COLUMNS =
  'id,played_at,patch,phase,game_number,matchday,group_label,stage_label,round_label,game_length_ms,winning_side,blue_team_id,blue_team_name,red_team_id,red_team_name,blue_kills,red_kills,mvp_name,mvp_champion,mvp_kills,mvp_deaths,mvp_assists,annulled,ruling,ruling_winner_team_id'

export type ListMatch = Pick<
  MatchSummaryRow,
  | 'id'
  | 'played_at'
  | 'patch'
  | 'phase'
  | 'game_number'
  | 'matchday'
  | 'group_label'
  | 'stage_label'
  | 'round_label'
  | 'game_length_ms'
  | 'winning_side'
  | 'blue_team_id'
  | 'blue_team_name'
  | 'red_team_id'
  | 'red_team_name'
  | 'blue_kills'
  | 'red_kills'
  | 'mvp_name'
  | 'mvp_champion'
  | 'mvp_kills'
  | 'mvp_deaths'
  | 'mvp_assists'
  | 'annulled'
  | 'ruling'
  | 'ruling_winner_team_id'
>

export function MatchList({
  matches,
  playersByMatch,
  statsByMatch,
  version,
  championNames: champNames,
  from,
  team = null,
  player = null,
}: {
  matches: ListMatch[]
  /** Each match's ten players, in lane order. See `loadMatchDetails`. */
  playersByMatch: Map<string, DetailPlayer[]>
  /** Each match's per-side totals, for the objectives in the detail. */
  statsByMatch: Map<string, Map<100 | 200, MatchTeamStatsRow>>
  version: string
  championNames: Record<string, string>
  /**
   * The origin passed to team links, for the back arrow on the team page.
   * Omitted where no origin key fits (e.g. player pages).
   */
  from?: Origin
  /**
   * A team to underline in every row. Omitted on /partidas, where
   * `MatchFilters` writes the same rule in the browser.
   */
  team?: string | null
  /**
   * A player whose champion gets a ring in every row, so it stands out among
   * the ten portraits on a player's history.
   */
  player?: string | null
}) {
  return (
    <>
      {team !== null && <style>{markRule(team)}</style>}

      {/*
        /partidas filters work on these attributes with CSS: `data-recorte` for
        the scope, `data-equipos` for the team, and `data-team` on each side for
        the underline. Filtering needs no request and no re-render.

        `data-recorte` holds every `?fecha=` value the match answers to, its
        phase and its matchday or round, so one `~=` rule covers both rows of
        the picker (see `scopesOf`).
      */}
      <ul id="partidas" className="flex flex-col gap-2">
        {matches.map((match) => (
          <li
            key={match.id}
            data-recorte={scopesOf(match).join(' ') || undefined}
            data-equipos={[match.blue_team_id, match.red_team_id].filter(Boolean).join(' ')}
          >
            <details className="group rounded-lg border border-line bg-surface open:border-line-strong">
              <summary className="flex cursor-pointer list-none items-center gap-4 px-4 py-3 [&::-webkit-details-marker]:hidden">
                <div className="w-28 shrink-0 text-xs text-faint">
                  <p className="tabular">{formatDate(match.played_at)}</p>
                  <p>
                    {matchPlace(match).join(' · ') || `parche ${match.patch ?? '?'}`}
                  </p>
                </div>

                {/*
                  Name, champions, score, champions, name: each side is one block
                  (see `SideBlock`) so the underline covers both. Champions are
                  hidden on small screens, where they do not fit next to the
                  names.
                */}
                <div className="flex flex-1 items-center justify-center gap-3">
                  <SideBlock
                    match={match}
                    side={100}
                    players={playersByMatch.get(match.id) ?? []}
                    version={version}
                    championNames={champNames}
                    from={from}
                    player={player}
                  />
                  <div className="tabular shrink-0 text-center">
                    <p className="text-lg font-bold">
                      <span className={!match.annulled && match.winning_side === 100 ? 'text-side-blue' : 'text-muted'}>
                        {match.blue_kills ?? 0}
                      </span>
                      <span className="mx-1 text-dim">–</span>
                      <span className={!match.annulled && match.winning_side === 200 ? 'text-side-red' : 'text-muted'}>
                        {match.red_kills ?? 0}
                      </span>
                    </p>
                    {/*
                      Annulled by the organizers: the game was played but is not a
                      result, so neither side is shown as the winner.
                    */}
                    {match.annulled ? (
                      <p
                        className="text-xs font-semibold uppercase tracking-wide text-accent"
                        title={`${rulingLabel(match.ruling)?.long ?? 'Anulada'}: no cuenta para la tabla ni las estadísticas`}
                      >
                        Anulada
                      </p>
                    ) : (
                      <p className="text-xs text-faint">{formatDuration(match.game_length_ms)}</p>
                    )}
                  </div>
                  <SideBlock
                    match={match}
                    side={200}
                    players={playersByMatch.get(match.id) ?? []}
                    version={version}
                    championNames={champNames}
                    from={from}
                    player={player}
                  />
                </div>

                <div className="hidden w-52 shrink-0 text-right text-xs md:block">
                  {match.mvp_champion ? (
                    <>
                      <p className="text-fg-soft">
                        <span className="text-faint">MVP </span>
                        {match.mvp_name ?? championName(champNames, match.mvp_champion)}
                      </p>
                      <p className="tabular text-faint">
                        {championName(champNames, match.mvp_champion)} ·{' '}
                        {formatKda(
                          match.mvp_kills ?? 0,
                          match.mvp_deaths ?? 0,
                          match.mvp_assists ?? 0,
                        )}
                      </p>
                    </>
                  ) : (
                    <p className="text-dim">sin MVP</p>
                  )}
                </div>

                <svg
                  viewBox="0 0 12 12"
                  aria-hidden="true"
                  className="h-3 w-3 shrink-0 text-faint transition-transform group-open:rotate-90"
                >
                  <path d="M4 2l5 4-5 4V2z" fill="currentColor" />
                </svg>
              </summary>

              <MatchDetail
                matchId={match.id}
                players={playersByMatch.get(match.id) ?? []}
                teamStats={statsByMatch.get(match.id) ?? new Map()}
                teamNames={{
                  100: match.blue_team_name ?? 'Lado azul',
                  200: match.red_team_name ?? 'Lado rojo',
                }}
                teamIds={{ 100: match.blue_team_id, 200: match.red_team_id }}
                version={version}
                championNames={champNames}
              />
            </details>
          </li>
        ))}
      </ul>
    </>
  )
}

/**
 * One side's five champions, in lane order, without names (too small) but with
 * `alt` text for screen readers. Nothing is drawn when the match has no
 * scoreboard loaded.
 */
function Champions({
  players,
  side,
  version,
  championNames: names,
  player,
}: {
  players: DetailPlayer[]
  side: 100 | 200
  version: string
  championNames: Record<string, string>
  /** The one to ring, when the listing is about somebody. */
  player: string | null
}) {
  const onSide = players.filter((entry) => entry.side === side)
  if (onSide.length === 0) return null

  return (
    <div className="hidden shrink-0 gap-0.5 md:flex">
      {onSide.map((entry) => {
        const champion = championName(names, entry.champion)
        const theirs = player !== null && entry.playerId === player

        return (
          <GameIcon
            key={entry.matchPlayerId}
            src={championIcon(version, entry.champion)}
            // The ring is also stated in the alt text for screen readers.
            alt={theirs ? `${champion}, el que jugó` : champion}
            size={32}
            /*
              The ring is drawn inside the portrait: an outer outline would overlap
              the neighbouring icon and a border would shift the row.
            */
            className={theirs ? 'outline-2 -outline-offset-2 outline-accent' : ''}
          />
        )
      })}
    </div>
  )
}

/**
 * One side of the row: team name and champions.
 *
 * Both sit in one box because that box is what `markRule` underlines; the
 * outer wrapper takes the free space so the line does not extend past the
 * content. The red side is mirrored so both teams' champions face the score.
 */
function SideBlock({
  match,
  side,
  players,
  version,
  championNames: names,
  from,
  player,
}: {
  match: ListMatch
  side: 100 | 200
  players: DetailPlayer[]
  version: string
  championNames: Record<string, string>
  from?: Origin
  player: string | null
}) {
  const blue = side === 100
  const teamId = blue ? match.blue_team_id : match.red_team_id

  return (
    <div
      className={`flex min-w-0 flex-1 items-center ${blue ? 'justify-end' : 'justify-start'}`}
    >
      <div
        data-team={teamId ?? undefined}
        className={`flex min-w-0 items-center gap-3 ${blue ? '' : 'flex-row-reverse'}`}
      >
        <SideName
          name={blue ? match.blue_team_name : match.red_team_name}
          teamId={teamId}
          side={side}
          won={!match.annulled && match.winning_side === side}
          from={from}
        />
        <Champions
          players={players}
          side={side}
          version={version}
          championNames={names}
          player={player}
        />
      </div>
    </div>
  )
}

/**
 * A team name in the row, linked to its page. The link sits inside the row's
 * `<summary>`: clicking it navigates without expanding the row. Unassigned
 * sides show "Lado azul" / "Lado rojo" without a link.
 */
function SideName({
  name,
  teamId,
  side,
  won,
  from,
}: {
  name: string | null
  /** Link target and underline key. */
  teamId: string | null
  side: 100 | 200
  won: boolean
  /** Without it the link has no `desde` and the team page uses its default back arrow. */
  from?: Origin
}) {
  const blue = side === 100
  const color = won ? (blue ? 'text-side-blue' : 'text-side-red') : 'text-fg-soft'

  return (
    <p
      className={`min-w-0 truncate text-sm font-medium ${color} ${
        blue ? 'text-right' : 'text-left'
      }`}
    >
      {name === null ? (
        <span className="text-dim">{blue ? 'Lado azul' : 'Lado rojo'}</span>
      ) : teamId === null ? (
        name
      ) : (
        <Link href={teamPath(teamId, from)} className="transition-colors hover:text-accent">
          {name}
        </Link>
      )}
    </p>
  )
}
