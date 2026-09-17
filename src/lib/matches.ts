/**
 * Data for match listing rows, shared by /partidas, team pages and player
 * pages: the scoreboard columns, each match's detail and lane ordering.
 */

import type { Supabase } from '@/lib/supabase/server'
import { ROLES } from '@/lib/format'
import { rows } from '@/lib/supabase/query'
import type { MatchPlayerScoreRow, MatchTeamStatsRow } from '@/types/db'

/**
 * The scoreboard columns the detail uses (no items or spells).
 *
 * Keep it a single string literal: supabase-js infers the result type from
 * it, and a concatenation widens it to `string` (`GenericStringError`).
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

/** A player as the match detail needs it. */
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
 * Preloaded instead of fetched when a row opens: a full tournament is a few
 * hundred scoreboard rows. If listings grow past ~150 matches, a per-match
 * endpoint would be the better trade-off.
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
 * Sort key for lane order (top, jungle, mid, ADC, support). Replays list
 * players in lobby order; scoreboards compare opponents lane by lane.
 */
function laneOrder(position: string | null): number {
  const index = ROLES.indexOf((position ?? '') as (typeof ROLES)[number])
  // Players without a position go last.
  return index === -1 ? ROLES.length : index
}
