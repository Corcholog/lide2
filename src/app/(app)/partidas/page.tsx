import Link from 'next/link'
import { getUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { rows } from '@/lib/supabase/query'
import { assetVersion, championNames } from '@/lib/ddragon'
import { tournamentStartDate, TOURNAMENT } from '@/lib/lide2/tournament'
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
 * The tournament's history.
 *
 * The rows are `MatchList`, the same ones a team's page draws, and the detail
 * inside them comes preloaded - `loadMatchDetails` says why in one go and not
 * on demand.
 *
 * THIS PAGE HAS NO FILTERS OF ITS OWN. It reads no query string: it always
 * loads the whole phase, and both cuts - the matchday and the team - are
 * honoured in the browser over the matches this render already sent. That is
 * what the preloading earns: picking a matchday is hiding rows, not fetching
 * anything, and going back to the whole phase is free. `MatchFilters` explains
 * how, and why the URL is still where the choice lives.
 *
 * What it costs is at the other end: a shared `?fecha=2` link now brings the
 * forty matches of the phase and not that matchday's sixteen. That is the
 * weight of the page everybody lands on anyway, and every change of cut after
 * it is free.
 */
export default async function MatchesPage() {
  // The list is visible without a session; uploading replays is not.
  const user = await getUser()
  const supabase = await createClient()
  const tournamentId = await resolveTournamentId(supabase)

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
    The phase, as the two filters see it: a matchday and two ids per match. It
    is what lets the browser answer how many matches are in the cut and whether
    any are left - see `cut.ts` - now that neither question goes to the server.
  */
  const cut: MatchCut[] = matches.map((match) => ({
    matchday: match.matchday,
    teams: [match.blue_team_id, match.red_team_id].filter((id) => id !== null),
  }))

  const { playersByMatch, statsByMatch } = await loadMatchDetails(
    supabase,
    matches.map((match) => match.id),
  )

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
            Two texts because these are two different people. With a session
            this is a working screen and what is missing is uploading the files.
            With none it is somebody who came to watch the tournament: asking
            them to upload a .rofl is asking for something they cannot do, in a
            word they may not even know.

            The third case - a cut that has nothing in it - is not here: which
            cut is being looked at is decided in the browser, so the note that
            says so is `MatchFilters`'.
          */}
          <p className="text-fg-soft">
            {user
              ? 'Subí los .rofl de las partidas jugadas para empezar.'
              : `Todavía no se jugó ninguna partida. La ${TOURNAMENT.name} arranca el ${tournamentStartDate()}.`}
          </p>
        </div>
      ) : (
        /*
          No `highlight`: which team is marked is decided in the browser, and
          `MatchFilters` writes that rule along with the ones that hide the
          rows. On a team's page, where the listing is already about one team,
          it is `MatchList` itself that writes it.
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
