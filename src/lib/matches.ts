/**
 * What a listing row needs, loaded once for the two pages that draw one.
 *
 * /partidas and a team's page show the same row - the one that expands into
 * both scoreboards - so what feeds it lives here instead of being written twice:
 * the scoreboard columns it reads, the detail of a set of matches already
 * grouped by match, and the lane order the two columns get compared in.
 */

import type { Supabase } from '@/lib/supabase/server'
import { ROLES } from '@/lib/format'
import { rows } from '@/lib/supabase/query'
import type { MatchPlayerScoreRow, MatchTeamStatsRow } from '@/types/db'

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

/** Both scoreboards of every asked-for match, keyed by match. */
export interface MatchDetails {
  playersByMatch: Map<string, DetailPlayer[]>
  statsByMatch: Map<string, Map<100 | 200, MatchTeamStatsRow>>
}

/**
 * The detail of a set of matches, in two queries.
 *
 * It is preloaded and not fetched when a row opens: sixty matches are six
 * hundred `match_player_scores` rows, and asking for them in one go costs less
 * than an endpoint of its own with its own loading state. If a listing ever went
 * past some 150 visible at once, a handler returning one match's detail on
 * demand would be the better trade.
 */
export async function loadMatchDetails(
  supabase: Supabase,
  ids: string[],
): Promise<MatchDetails> {
  const empty: MatchDetails = { playersByMatch: new Map(), statsByMatch: new Map() }
  if (ids.length === 0) return empty

  const [scoresRes, statsRes] = await Promise.all([
    supabase.from('match_player_scores').select(DETAIL_COLUMNS).in('match_id', ids),
    supabase.from('match_team_stats').select('*').in('match_id', ids),
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

  for (const list of playersByMatch.values()) {
    list.sort((a, b) => a.side - b.side || laneOrder(a.position) - laneOrder(b.position))
  }

  const statsByMatch = new Map<string, Map<100 | 200, MatchTeamStatsRow>>()
  for (const row of teamStats) {
    const sides = statsByMatch.get(row.match_id) ?? new Map<100 | 200, MatchTeamStatsRow>()
    sides.set(row.side, row)
    statsByMatch.set(row.match_id, sides)
  }

  return { playersByMatch, statsByMatch }
}

/**
 * Each team, in lane order: top, jungle, mid, ADC, support.
 *
 * `match_player_scores` returns them in the order the .rofl wrote them, which
 * is the lobby's slot order and means nothing. A scoreboard is read by lane -
 * who won mid, how the bot lane went - and for that the two columns have to be
 * in the same order; otherwise comparing opponents means your eyes going back
 * and forth.
 *
 * It is sorted here and not in each component because both use it: the closed
 * row, for the champion icons, and the expanded detail.
 */
function laneOrder(position: string | null): number {
  const index = ROLES.indexOf((position ?? '') as (typeof ROLES)[number])
  // No position goes last: the .rofl does not always carry it.
  return index === -1 ? ROLES.length : index
}
