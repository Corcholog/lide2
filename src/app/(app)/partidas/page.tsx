import Link from 'next/link'
import { getUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { rows } from '@/lib/supabase/query'
import { assetVersion, championIcon, championName, championNames } from '@/lib/ddragon'
import { formatDate, formatDuration, formatKda, ROLES } from '@/lib/format'
import { tournamentStartDate, TOURNAMENT } from '@/lib/lide2/tournament'
import { parseTeamFilter } from '@/lib/stats/scope'
import { resolveTournamentId } from '@/lib/stats/query'
import { parseScope } from '@/lib/stats/scope'
import { ScopeNav } from '@/components/stats/ScopeNav'
import { GameIcon } from '@/components/match/GameIcon'
import { MatchDetail, type DetailPlayer } from '@/components/match/MatchDetail'
import { TeamFilter } from '@/components/match/TeamFilter'
import type { MatchPlayerScoreRow, MatchSummaryRow, MatchTeamStatsRow } from '@/types/db'

export const metadata = {
  title: 'Partidas',
  description: 'Todas las partidas jugadas, con su marcador, su duración y su MVP.',
}

export const dynamic = 'force-dynamic'

/**
 * The tournament's history.
 *
 * Every match is a row that expands: inside is both teams' summarized
 * scoreboard. You used to have to open the match page to see anything, and
 * going over a whole matchday was ten trips back and forth.
 *
 * THE EXPANDER IS A NATIVE `<details>` and not a client island: it needs no
 * JavaScript, the browser already gives it `aria-expanded`, toggling with Enter
 * and the focus where it belongs, and on top of that it does not draw the
 * content while closed. It is the same reason the filters are links and not
 * React state.
 *
 * THE DETAIL COMES PRELOADED. The whole tournament is about sixty matches, that
 * is six hundred `match_player_scores` rows: fetching them in one go costs less
 * than a separate endpoint with its own loading state. The needed columns are
 * requested and not `*` - items and spells are seven icons per player that
 * nobody looks at here - and it is scoped to the already-filtered matches. If
 * the listing ever went past some 150 visible at once, then a handler returning
 * one match's detail on demand would be the better trade.
 */

/**
 * The scoreboard columns the detail uses. No items, no spells.
 *
 * It goes on a single line and is not split with `+`: supabase-js looks at this
 * string's TYPE to know what the query returns, and a concatenation stops being
 * a literal and becomes `string`, which makes the result unusable
 * (`GenericStringError`).
 */
const DETAIL_COLUMNS =
  'match_player_id,match_id,side,player_id,champion,position,riot_game_name,riot_tag_line,kills,deaths,assists,cs,csm,gold_earned,damage_to_champions,vision_score,kill_participation,match_rank'

type DetailScore = Pick<
  MatchPlayerScoreRow,
  | 'match_player_id'
  | 'match_id'
  | 'side'
  | 'player_id'
  | 'champion'
  | 'position'
  | 'riot_game_name'
  | 'riot_tag_line'
  | 'kills'
  | 'deaths'
  | 'assists'
  | 'cs'
  | 'csm'
  | 'gold_earned'
  | 'damage_to_champions'
  | 'vision_score'
  | 'kill_participation'
  | 'match_rank'
>

export default async function MatchesPage({ searchParams }: PageProps<'/partidas'>) {
  // The list is visible without a session; uploading replays is not.
  const user = await getUser()
  const supabase = await createClient()
  const tournamentId = await resolveTournamentId(supabase)

  const params = await searchParams

  /*
   * The tournament's matches only.
   *
   * Without the filter this list showed the whole of `match_summaries`, which
   * is every .rofl ever uploaded: the test ones, the ones from another
   * tournament and the ones waiting for somebody to assign them a matchup. None
   * of that is LIDE 2, and on a public page it reads as if it were.
   *
   * The ones that do not have a matchup yet are visible on /admin/asignar,
   * which is where they need to be seen.
   */
  const teams = tournamentId
    ? rows<{ id: string; name: string; group_label: string | null }>(
        await supabase
          .from('teams')
          .select('id,name,group_label')
          .eq('tournament_id', tournamentId)
          .order('name'),
        'the teams',
      )
    : []

  const scope = parseScope(params.fecha, tournamentId ?? '')
  const teamId = parseTeamFilter(
    params.equipo,
    teams.map((team) => team.id),
  )
  const filtering = scope.matchday !== null || teamId !== null

  let query = supabase
    .from('match_summaries')
    .select('*')
    .eq('tournament_id', tournamentId ?? '')
    .order('played_at', { ascending: false, nullsFirst: false })
    .limit(100)

  // `matchday` has come from match_summaries since 0021: without that column
  // you had to ask match_context for the matchday's ids first and filter with
  // an `in`.
  if (scope.matchday !== null) query = query.eq('matchday', scope.matchday)
  if (teamId) query = query.or(`blue_team_id.eq.${teamId},red_team_id.eq.${teamId}`)

  const matches = tournamentId ? rows<MatchSummaryRow>(await query, 'the matches') : []
  const ids = matches.map((match) => match.id)

  const [scoresRes, statsRes] = await Promise.all([
    ids.length > 0
      ? supabase.from('match_player_scores').select(DETAIL_COLUMNS).in('match_id', ids)
      : Promise.resolve({ data: [], error: null }),
    ids.length > 0
      ? supabase.from('match_team_stats').select('*').in('match_id', ids)
      : Promise.resolve({ data: [], error: null }),
  ])

  const scores = rows<DetailScore>(scoresRes, 'the match details')
  const teamStats = rows<MatchTeamStatsRow>(statsRes, 'the per-team totals')

  const playersByMatch = new Map<string, DetailPlayer[]>()
  for (const score of scores) {
    const list = playersByMatch.get(score.match_id) ?? []
    list.push({
      matchPlayerId: score.match_player_id,
      side: score.side,
      playerId: score.player_id,
      champion: score.champion,
      position: score.position,
      riotGameName: score.riot_game_name,
      riotTagLine: score.riot_tag_line,
      kills: score.kills,
      deaths: score.deaths,
      assists: score.assists,
      killParticipation: Number(score.kill_participation),
      cs: score.cs,
      csm: Number(score.csm),
      goldEarned: score.gold_earned,
      damageToChampions: score.damage_to_champions,
      visionScore: score.vision_score,
      isMvp: score.match_rank === 1,
    })
    playersByMatch.set(score.match_id, list)
  }

  /*
   * Each team, in lane order: top, jungle, mid, ADC, support.
   *
   * `match_player_scores` returns them in the order the .rofl wrote them, which
   * is the lobby's slot order and means nothing. A scoreboard is read by lane -
   * who won mid, how the bot lane went - and for that the two columns have to
   * be in the same order; otherwise comparing opponents means your eyes going
   * back and forth.
   *
   * It is sorted once here and not in each component because both use it: the
   * closed row, for the champion icons, and the expanded detail.
   */
  const laneOrder = (position: string | null) => {
    const index = ROLES.indexOf((position ?? '') as (typeof ROLES)[number])
    // No position goes last: the .rofl does not always carry it.
    return index === -1 ? ROLES.length : index
  }

  for (const list of playersByMatch.values()) {
    list.sort((a, b) => a.side - b.side || laneOrder(a.position) - laneOrder(b.position))
  }

  const statsByMatch = new Map<string, Map<100 | 200, MatchTeamStatsRow>>()
  for (const row of teamStats) {
    const sides = statsByMatch.get(row.match_id) ?? new Map<100 | 200, MatchTeamStatsRow>()
    sides.set(row.side, row)
    statsByMatch.set(row.match_id, sides)
  }

  // The listing spans patches, but champion names do not change from one to
  // another: the latest catalogue is enough.
  const version = await assetVersion(null)
  const champNames = await championNames(version)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          {/* The same treatment as stats, tables and admin: moving between
              sections, the title should not change size or shape. */}
          <h1 className="font-display text-3xl uppercase tracking-tight">Partidas</h1>
          <p className="mt-1 text-sm text-muted">
            {matches.length === 0
              ? 'Todavía no hay partidas cargadas.'
              : `${matches.length} partida${matches.length === 1 ? '' : 's'}${
                  filtering ? ' en este recorte' : ' cargadas'
                }.`}
          </p>
        </div>
        {user && (
          <Link
            href="/admin/upload"
            className="rounded bg-accent-strong px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent"
          >
            Subir replays
          </Link>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <ScopeNav base="/partidas" matchday={scope.matchday} query={{ equipo: teamId }} />
        {teams.length > 0 && (
          <TeamFilter teams={teams} selected={teamId} matchday={scope.matchday} />
        )}
      </div>

      {matches.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line-strong px-6 py-14 text-center">
          {/*
            Three texts because these are three different situations. With a
            filter on, what is missing is not that anything be played: it is
            loosening the filter. With no filter and a session this is a
            working screen and what is missing is uploading the files. With no
            session it is somebody who came to watch the tournament: asking them
            to upload a .rofl is asking for something they cannot do, in a word
            they may not even know.
          */}
          <p className="text-fg-soft">
            {filtering
              ? 'Ninguna partida de este recorte. Probá con otra fecha u otro equipo.'
              : user
                ? 'Subí los .rofl de las partidas jugadas para empezar.'
                : `Todavía no se jugó ninguna partida. La ${TOURNAMENT.name} arranca el ${tournamentStartDate()}.`}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {matches.map((match) => (
            <li key={match.id}>
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
                    the scoreline, which is the order it gets read in: who
                    against whom, with what. Placed below the name they had to
                    fit in half the row's width and never got past twenty
                    pixels, which for a champion portrait is a smudge.

                    On small screens the champions are dropped: five 32px ones
                    per side do not fit beside the names, and what cannot shrink
                    any further without becoming unreadable is the scoreline.
                  */}
                  <div className="flex flex-1 items-center justify-center gap-3">
                    <SideName
                      name={match.blue_team_name}
                      fallback="Lado azul"
                      won={match.winning_side === 100}
                      align="right"
                      accent="aqua"
                    />
                    <Champions
                      players={playersByMatch.get(match.id) ?? []}
                      side={100}
                      version={version}
                      championNames={champNames}
                    />
                    <div className="tabular shrink-0 text-center">
                      <p className="text-lg font-bold">
                        <span
                          className={match.winning_side === 100 ? 'text-side-blue' : 'text-muted'}
                        >
                          {match.blue_kills ?? 0}
                        </span>
                        <span className="mx-1 text-dim">–</span>
                        <span
                          className={match.winning_side === 200 ? 'text-side-red' : 'text-muted'}
                        >
                          {match.red_kills ?? 0}
                        </span>
                      </p>
                      <p className="text-xs text-faint">{formatDuration(match.game_length_ms)}</p>
                    </div>
                    <Champions
                      players={playersByMatch.get(match.id) ?? []}
                      side={200}
                      version={version}
                      championNames={champNames}
                    />
                    <SideName
                      name={match.red_team_name}
                      fallback="Lado rojo"
                      won={match.winning_side === 200}
                      align="left"
                      accent="red"
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
                  version={version}
                  championNames={champNames}
                />
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
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

function SideName({
  name,
  fallback,
  won,
  align,
  accent,
}: {
  name: string | null
  fallback: string
  won: boolean
  align: 'left' | 'right'
  accent: 'aqua' | 'red'
}) {
  const color = won ? (accent === 'aqua' ? 'text-side-blue' : 'text-side-red') : 'text-fg-soft'

  return (
    <p
      className={`min-w-0 flex-1 truncate text-sm font-medium ${color} ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      {name ?? <span className="text-dim">{fallback}</span>}
    </p>
  )
}
