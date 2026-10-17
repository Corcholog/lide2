import { ROLES, formatKdaAverage } from '@/lib/format'
import type { Supabase } from '@/lib/supabase/server'
import { rows } from '@/lib/supabase/query'
import type { PlayerPhaseTotalsRow, TeamLineupRow } from '@/types/db'

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
  /** Null while the player has no stats yet (no replay assigned with them). */
  stats: {
    games: number
    /** The ratio of totals, "3.4". */
    kda: string
    /** Average kills/deaths/assists per game, "4/1.5/7". */
    line: string
    /** Damage per minute, whole number. */
    dpm: number
    /** Gold per minute, whole number. */
    gpm: number
  } | null
}

function statsOf(row: PlayerPhaseTotalsRow | undefined): RosterCard['stats'] {
  if (!row) return null

  return {
    games: row.games,
    kda: row.kda.toFixed(1),
    line: formatKdaAverage(row.avg_kills, row.avg_deaths, row.avg_assists),
    dpm: Math.round(row.dpm),
    gpm: Math.round(row.gpm),
  }
}

/**
 * The five starters in lane order, each with the tournament numbers they have.
 *
 * The lineup decides who is shown, so the cards are there from the moment the
 * champion is known; the numbers come from the replays assigned so far and are
 * missing for a player none is assigned for (the final's games before their
 * replays are filed do not count yet). A player appears once, under the slot's
 * role, and a slot nobody fills is left out.
 *
 * With no lineup at all (a team nobody entered a roster for) it falls back to
 * whoever played each role most, from the stats alone.
 */
export function championRoster(
  lineup: TeamLineupRow[],
  players: PlayerPhaseTotalsRow[],
): RosterCard[] {
  const byPlayer = new Map(players.filter((row) => row.player_id).map((row) => [row.player_id!, row]))

  const starters = lineup.filter(
    (slot) => slot.slot >= 1 && slot.slot <= 5 && slot.role && slot.player_id && (slot.name ?? slot.game_name),
  )

  if (starters.length > 0) {
    return ROLES.flatMap((role) => {
      const slot = starters.find((item) => item.role === role)
      if (!slot?.player_id) return []

      return [
        {
          playerId: slot.player_id,
          name: (slot.name ?? slot.game_name)!,
          role,
          stats: statsOf(byPlayer.get(slot.player_id)),
        },
      ]
    })
  }

  return ROLES.flatMap((role) => {
    const best = players
      .filter((row) => row.position === role && row.player_id && row.player_name)
      .sort((a, b) => b.games - a.games)[0]

    return best?.player_id && best.player_name
      ? [{ playerId: best.player_id, name: best.player_name, role, stats: statsOf(best) }]
      : []
  })
}

/** A team's five: the lineup, with the whole-tournament row of each player. */
export async function loadTeamPlayers(
  supabase: Supabase,
  tournamentId: string,
  teamId: string,
): Promise<RosterCard[]> {
  const [lineup, totals] = await Promise.all([
    supabase.from('team_lineup').select('*').eq('team_id', teamId).order('slot'),
    supabase
      .from('player_phase_totals')
      .select('*')
      .match({ tournament_id: tournamentId, all_phases: true, team_id: teamId }),
  ])

  return championRoster(
    rows<TeamLineupRow>(lineup, 'the champion lineup'),
    rows<PlayerPhaseTotalsRow>(totals, 'the champion roster'),
  )
}
