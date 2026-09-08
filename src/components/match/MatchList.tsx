import Link from 'next/link'
import { GameIcon } from '@/components/match/GameIcon'
import { MatchDetail } from '@/components/match/MatchDetail'
import { markRule } from '@/components/match/mark'
import { championIcon, championName } from '@/lib/ddragon'
import { formatDate, formatDuration, formatKda } from '@/lib/format'
import type { DetailPlayer } from '@/lib/matches'
import { teamPath, type Origin } from '@/lib/routes'
import type { MatchSummaryRow, MatchTeamStatsRow } from '@/types/db'

/**
 * The matches, as rows that expand.
 *
 * Inside each one is both teams' summarized scoreboard. You used to have to
 * open the match page to see anything, and going over a whole matchday was ten
 * trips back and forth.
 *
 * THE EXPANDER IS A NATIVE `<details>` and not a client island: it needs no
 * JavaScript, the browser already gives it `aria-expanded`, toggling with Enter
 * and the focus where it belongs, and on top of that it does not draw the
 * content while closed.
 *
 * IT IS SHARED BY /partidas AND A TEAM'S PAGE, which used to draw a listing of
 * its own - one line each, "Ganó · vs Rival · 12 - 7" - written from that team's
 * point of view. Keeping two listings of the same thing meant one of them got
 * the champions, the MVP and the detail and the other did not; what that one
 * did better, saying whose the scoreline is, is what the mark does here.
 */

/**
 * The `match_summaries` columns a row reads.
 *
 * On a single line and not concatenated: supabase-js looks at this string's
 * TYPE to know what the query returns, and a sum stops being a literal.
 */
export const LIST_COLUMNS =
  'id,played_at,patch,matchday,group_label,stage_label,round_label,game_length_ms,winning_side,blue_team_id,blue_team_name,red_team_id,red_team_name,blue_kills,red_kills,mvp_name,mvp_champion,mvp_kills,mvp_deaths,mvp_assists'

export type ListMatch = Pick<
  MatchSummaryRow,
  | 'id'
  | 'played_at'
  | 'patch'
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
>

export function MatchList({
  matches,
  playersByMatch,
  statsByMatch,
  version,
  championNames: champNames,
  from,
  highlight = null,
}: {
  matches: ListMatch[]
  /** Each match's ten players, in lane order. See `loadMatchDetails`. */
  playersByMatch: Map<string, DetailPlayer[]>
  /** Each match's per-side totals, for the objectives in the detail. */
  statsByMatch: Map<string, Map<100 | 200, MatchTeamStatsRow>>
  version: string
  championNames: Record<string, string>
  /** Where the team names lead FROM, for the back arrow on their page. */
  from: Origin
  /**
   * A team to mark in every row, for a listing that is already about it. On
   * /partidas it is left out: there the team is picked in the browser and it is
   * `MatchFilters` that writes the same rule.
   */
  highlight?: string | null
}) {
  return (
    <>
      {highlight !== null && <style>{markRule(highlight)}</style>}

      {/*
        The id and the two attributes on each row are what /partidas' filters
        work on: one CSS rule hides every row outside the chosen matchday
        (`data-fecha`), another every row without the chosen team
        (`data-equipos`), and a third underlines that team's side wherever the
        listing draws it - `SideBlock` in the row, the header in the open detail
        - which is what `data-team` is for. They are plain attributes on server
        HTML, which is why changing the cut costs nothing there: no request, no
        re-render, not even for the ten scoreboards each row is already holding.
      */}
      <ul id="partidas" className="flex flex-col gap-2">
        {matches.map((match) => (
          <li
            key={match.id}
            data-fecha={match.matchday ?? undefined}
            data-equipos={[match.blue_team_id, match.red_team_id].filter(Boolean).join(' ')}
          >
            <details className="group rounded-lg border border-line bg-surface open:border-line-strong">
              <summary className="flex cursor-pointer list-none items-center gap-4 px-4 py-3 [&::-webkit-details-marker]:hidden">
                <div className="w-28 shrink-0 text-xs text-faint">
                  <p className="tabular">{formatDate(match.played_at)}</p>
                  <p>
                    {[match.group_label, match.matchday && `Fecha ${match.matchday}`]
                      .filter(Boolean)
                      .join(' · ') ||
                      [match.stage_label, match.round_label].filter(Boolean).join(' · ') ||
                      `parche ${match.patch ?? '?'}`}
                  </p>
                </div>

                {/*
                  Name, champions, scoreline, champions, name.

                  The two teams sit at the ends and the ten champions against
                  the scoreline, which is the order it gets read in: who against
                  whom, with what. Each side is one block - see `SideBlock` -
                  because that pair is what the mark underlines. Placed below the
                  name the champions had to fit in half the row's width and never
                  got past twenty pixels, which for a portrait is a smudge.

                  On small screens the champions are dropped: five 32px ones per
                  side do not fit beside the names, and what cannot shrink any
                  further without becoming unreadable is the scoreline.
                */}
                <div className="flex flex-1 items-center justify-center gap-3">
                  <SideBlock
                    match={match}
                    side={100}
                    players={playersByMatch.get(match.id) ?? []}
                    version={version}
                    championNames={champNames}
                    from={from}
                  />
                  <div className="tabular shrink-0 text-center">
                    <p className="text-lg font-bold">
                      <span className={match.winning_side === 100 ? 'text-side-blue' : 'text-muted'}>
                        {match.blue_kills ?? 0}
                      </span>
                      <span className="mx-1 text-dim">–</span>
                      <span className={match.winning_side === 200 ? 'text-side-red' : 'text-muted'}>
                        {match.red_kills ?? 0}
                      </span>
                    </p>
                    <p className="text-xs text-faint">{formatDuration(match.game_length_ms)}</p>
                  </div>
                  <SideBlock
                    match={match}
                    side={200}
                    players={playersByMatch.get(match.id) ?? []}
                    version={version}
                    championNames={champNames}
                    from={from}
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
 * One side's five champions, in lane order.
 *
 * They go without names - they are 20px, a name does not fit - but with an
 * `alt`, so a screen reader reads the composition anyway and the `title` shows
 * it on hover. If a match has no scoreboard loaded, nothing is drawn at all
 * instead of five grey gaps.
 */
function Champions({
  players,
  side,
  version,
  championNames: names,
}: {
  players: DetailPlayer[]
  side: 100 | 200
  version: string
  championNames: Record<string, string>
}) {
  const onSide = players.filter((player) => player.side === side)
  if (onSide.length === 0) return null

  return (
    <div className="hidden shrink-0 gap-0.5 md:flex">
      {onSide.map((player) => {
        const champion = championName(names, player.champion)
        return (
          <GameIcon
            key={player.matchPlayerId}
            src={championIcon(version, player.champion)}
            alt={champion}
            size={32}
          />
        )
      })}
    </div>
  )
}

/**
 * One side of the row: the team's name and the five champions it played.
 *
 * THE TWO GO IN ONE BOX because that box is what the mark underlines - see
 * `markRule` - and a line has to have something to run under. The box is the
 * size of what is in it and the aligner around it is what takes the free space:
 * drawn on the flexible one, the line would carry on under the gap between the
 * name and the date.
 *
 * The red side is mirrored so that the champions of both teams end up against
 * the scoreline, which is how the row gets read: who against whom, with what.
 */
function SideBlock({
  match,
  side,
  players,
  version,
  championNames: names,
  from,
}: {
  match: ListMatch
  side: 100 | 200
  players: DetailPlayer[]
  version: string
  championNames: Record<string, string>
  from: Origin
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
          won={match.winning_side === side}
          from={from}
        />
        <Champions players={players} side={side} version={version} championNames={names} />
      </div>
    </div>
  )
}

/**
 * A team's name in the row, and the way to its page.
 *
 * IT IS A LINK NOW, inside a `<summary>` that opens the match on click. The two
 * do not fight: a click lands on the link, which is what runs, so the row does
 * not also expand under the page that is leaving. What it costs is that the
 * name stops being part of the surface that opens the row - which is the point,
 * because a team's name reading as a team's name is what makes the listing
 * walkable in the first place.
 *
 * Without a name there is no link: an unassigned side says "Lado azul" and
 * leads nowhere, because there is nothing to lead to.
 */
function SideName({
  name,
  teamId,
  side,
  won,
  from,
}: {
  name: string | null
  /** Who they are: where the link goes, and what the mark is keyed on. */
  teamId: string | null
  side: 100 | 200
  won: boolean
  from: Origin
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
