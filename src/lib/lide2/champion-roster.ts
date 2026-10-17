import { ROLES, formatKdaAverage } from '@/lib/format'
import type { Supabase } from '@/lib/supabase/server'
import { rows } from '@/lib/supabase/query'
import type { PlayerPhaseTotalsRow } from '@/types/db'

/**
 * The five players the champion's spotlight shows, with their tournament-wide
 * numbers.
 *
 * Damage and gold at 15 minutes are not here: the replays only carry
 * end-of-game totals, so the per-minute rates stand in for them.
 */

export interface RosterCard {
  playerId: string
  name: string
  /** One of `ROLES`. */
  role: string
  games: number
  /** The ratio of totals, "3.4". */
  kda: string
  /** Average kills/deaths/assists per game, "4/1.5/7". */
  line: string
  /** Damage per minute, whole number. */
  dpm: number
  /** Gold per minute, whole number. */
  gpm: number
}

/**
 * One player per role, in lane order: the one who played the role most.
 *
 * A role nobody played is left out rather than filled with someone else, and
 * rows without a player or a known role are ignored.
 */
export function championRoster(players: PlayerPhaseTotalsRow[]): RosterCard[] {
  const cards: RosterCard[] = []

  for (const role of ROLES) {
    const best = players
      .filter((row) => row.position === role && row.player_id && row.player_name)
      .sort((a, b) => b.games - a.games)[0]

    if (!best?.player_id || !best.player_name) continue

    cards.push({
      playerId: best.player_id,
      name: best.player_name,
      role,
      games: best.games,
      kda: best.kda.toFixed(1),
      line: formatKdaAverage(best.avg_kills, best.avg_deaths, best.avg_assists),
      dpm: Math.round(best.dpm),
      gpm: Math.round(best.gpm),
    })
  }

  return cards
}

/** A team's five, from the whole-tournament row of each player. */
export async function loadTeamPlayers(
  supabase: Supabase,
  tournamentId: string,
  teamId: string,
): Promise<RosterCard[]> {
  const result = await supabase
    .from('player_phase_totals')
    .select('*')
    .match({ tournament_id: tournamentId, all_phases: true, team_id: teamId })

  return championRoster(rows<PlayerPhaseTotalsRow>(result, 'the champion roster'))
}
