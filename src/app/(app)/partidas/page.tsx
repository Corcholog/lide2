import Link from 'next/link'
import { getUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { rows } from '@/lib/supabase/query'
import { assetVersion, championNames } from '@/lib/ddragon'
import { loadMatchDetails } from '@/lib/matches'
import { resolveTournamentId } from '@/lib/stats/query'
import type { MatchCut } from '@/components/match/cut'
import { MatchCount } from '@/components/match/MatchCount'
import { MatchFilters } from '@/components/match/MatchFilters'
import { LIST_COLUMNS, MatchList, type ListMatch } from '@/components/match/MatchList'

export const metadata = {
  title: 'Partidas',
  description: 'Todas las partidas jugadas, con su marcador, su duración y su MVP.',
}

export const dynamic = 'force-dynamic'

/**
 * The match history.
 *
 * Rows are `MatchList`, with details preloaded (see `loadMatchDetails`). The
 * page reads no query string: it always loads the whole phase, and the matchday
 * and team filters run in the browser (see `MatchFilters`). A shared
 * `?fecha=2` link therefore still loads every match, which is the same page
 * everyone lands on anyway.
 */
export default async function MatchesPage() {
  // The list is public; uploading replays needs a session.
  const user = await getUser()
  const supabase = await createClient()
  const tournamentId = await resolveTournamentId(supabase)

  /*
   * Only this tournament's matches: `match_summaries` also holds test uploads and
   * matches not yet assigned, which are listed on /admin/asignar.
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

  const matches = tournamentId
    ? rows<ListMatch>(
        await supabase
          .from('match_summaries')
          .select(LIST_COLUMNS)
          .eq('tournament_id', tournamentId)
          .order('played_at', { ascending: false, nullsFirst: false })
          .limit(100),
        'the matches',
      )
    : []

  /*
    Each match reduced to its matchday and team ids, so the browser can count
    matches in the current filter (see `cut.ts`).
  */
  const cut: MatchCut[] = matches.map((match) => ({
    matchday: match.matchday,
    teams: [match.blue_team_id, match.red_team_id].filter((id) => id !== null),
  }))

  const { playersByMatch, statsByMatch } = await loadMatchDetails(
    supabase,
    matches.map((match) => match.id),
  )

  // Champion names do not change between patches: the latest catalog is enough.
  const version = await assetVersion(null)
  const champNames = await championNames(version)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          {/* Same heading style as the other sections. */}
          <h1 className="font-display text-3xl uppercase tracking-tight">Partidas</h1>
          <MatchCount matches={cut} teamIds={teams.map((team) => team.id)} />
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

      {teams.length > 0 && <MatchFilters teams={teams} matches={cut} />}

      {matches.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line-strong px-6 py-14 text-center">
          {/*
            Different text for admins (upload replays) and visitors. The empty
            filter case is handled by `MatchFilters` in the browser.
          */}
          <p className="text-fg-soft">
            {user
              ? 'Subí los .rofl de las partidas jugadas para empezar.'
              : 'Todavía no se jugó ninguna partida.'}
          </p>
        </div>
      ) : (
        /*
          No `team` here: `MatchFilters` writes the team underline in the browser.
        */
        <MatchList
          from="partidas"
          matches={matches}
          playersByMatch={playersByMatch}
          statsByMatch={statsByMatch}
          version={version}
          championNames={champNames}
        />
      )}
    </div>
  )
}
