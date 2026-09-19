/**
 * Loads everything a stats scope needs.
 *
 * One query per view rather than per stat: the views are already aggregated
 * and small, so every stat can be a pure function over loaded data and be
 * tested without a database.
 */

import type { Supabase } from '@/lib/supabase/server'
import { assetVersion, championNames } from '@/lib/ddragon'
import { TOURNAMENT } from '@/lib/lide2/tournament'
import type {
  ChampionStatRow,
  MatchRecordRow,
  PlayerPhaseTotalsRow,
  TeamPhaseTotalsRow,
  TournamentMvpRow,
  UniversityTotalsRow,
} from '@/types/db'
import { maybeRow, rows } from '@/lib/supabase/query'
import { matchFilter, scopeFilter } from './filters'
import type { StatScope, StatsData } from './types'

export async function resolveTournamentId(supabase: Supabase): Promise<string | null> {
  const tournament = maybeRow<{ id: string }>(
    await supabase.from('tournaments').select('id').eq('slug', TOURNAMENT.slug).maybeSingle(),
    'the tournament',
  )

  return tournament?.id ?? null
}

export async function loadStats(supabase: Supabase, scope: StatScope): Promise<StatsData> {
  const filter = scopeFilter(scope)

  // Resolved first: champion names and icon URLs both need it.
  const version = await assetVersion(null)

  const [players, teams, universities, champions, records, mvp, names] = await Promise.all([
    supabase.from('player_phase_totals').select('*').match(filter),
    supabase.from('team_phase_totals').select('*').match(filter),
    supabase.from('university_totals').select('*').match(filter),
    supabase.from('champion_stats').select('*').match(filter),
    /*
      `not null` on the phase as well: unlike the accumulated views, which drop
      unresolved rows when they aggregate (0032), this one has a row per match,
      so an upload nobody has assigned yet would show up in the tournament
      scope, which pins no phase.
    */
    supabase.from('match_records').select('*').match(matchFilter(scope)).not('phase', 'is', null),
    supabase.from('tournament_mvp').select('*').match(filter),
    // Names do not change between patches, so the latest version is enough.
    // This is the one request that does not go to the database.
    championNames(version),
  ])

  // If any query fails, the whole load fails: a page silently missing one
  // section would be wrong, not just incomplete.
  return {
    scope,
    players: rows<PlayerPhaseTotalsRow>(players, 'the per-player totals'),
    teams: rows<TeamPhaseTotalsRow>(teams, 'the per-team totals'),
    universities: rows<UniversityTotalsRow>(universities, 'the per-university totals'),
    champions: rows<ChampionStatRow>(champions, 'the champion stats'),
    records: rows<MatchRecordRow>(records, 'the match records'),
    mvp: rows<TournamentMvpRow>(mvp, 'the tournament MVP'),
    championNames: names,
    assetVersion: version,
  }
}
