/**
 * Pulls from the database everything one scope of the tournament needs.
 *
 * Five queries and not one per stat. The views already return the aggregated
 * totals — 113 players, 20 teams, 13 universities — so fetching them whole and
 * sorting in memory costs less than twenty round trips to Postgres, and it
 * leaves every stat as a pure function over data that is already loaded: they
 * can be tested without a database.
 */

import type { createClient } from '@/lib/supabase/server'
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

type Supabase = Awaited<ReturnType<typeof createClient>>

export async function resolveTournamentId(supabase: Supabase): Promise<string | null> {
  const tournament = maybeRow<{ id: string }>(
    await supabase.from('tournaments').select('id').eq('slug', TOURNAMENT.slug).maybeSingle(),
    'the tournament',
  )

  return tournament?.id ?? null
}

export async function loadStats(supabase: Supabase, scope: StatScope): Promise<StatsData> {
  const filter = scopeFilter(scope)

  // The asset version is resolved before the rest: both the champion names and
  // their icon URLs need it.
  const version = await assetVersion(null)

  const [players, teams, universities, champions, records, mvp, names] = await Promise.all([
    supabase.from('player_phase_totals').select('*').match(filter),
    supabase.from('team_phase_totals').select('*').match(filter),
    supabase.from('university_totals').select('*').match(filter),
    supabase.from('champion_stats').select('*').match(filter),
    supabase.from('match_records').select('*').match(matchFilter(scope)),
    supabase.from('tournament_mvp').select('*').match(filter),
    // A scope spans patches, and the names are the same across all of them: the
    // latest one is enough. It is the only request that does not go to the
    // database, and the only one that can fail without dragging the rest down.
    championNames(version),
  ])

  /*
   * If one of the six fails, everything fails.
   *
   * A scope missing one query is not incomplete, it is wrong: the page would
   * show the meta without the MVP, or the records without the universities,
   * without saying anywhere that something is missing.
   */
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
