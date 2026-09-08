import Link from 'next/link'
import { getUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { rows } from '@/lib/supabase/query'
import { assetVersion, championNames } from '@/lib/ddragon'
import { tournamentStartDate, TOURNAMENT } from '@/lib/lide2/tournament'
import { loadMatchDetails } from '@/lib/matches'
import { resolveTournamentId } from '@/lib/stats/query'
import { parseScope } from '@/lib/stats/scope'
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
 * THE TEAM FILTER IS THE ONE THING HERE THAT IS NOT A SERVER FILTER, and it is
 * that preloading that earns it: every match is already here, so picking a team
 * is hiding rows and not fetching anything. `MatchFilters` explains how, and why
 * the URL is still where the choice lives.
 */
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

  /*
    `?equipo=` IS NOT READ HERE, on purpose. The team filter is honoured in the
    browser over the matches this query already brings - see `MatchFilters` -
    so cutting them here as well would leave it with nothing to widen back out
    to the moment somebody picked a second team.
  */
  let query = supabase
    .from('match_summaries')
    .select(LIST_COLUMNS)
    .eq('tournament_id', tournamentId ?? '')
    .order('played_at', { ascending: false, nullsFirst: false })
    .limit(100)

  // `matchday` has come from match_summaries since 0021: without that column
  // you had to ask match_context for the matchday's ids first and filter with
  // an `in`.
  if (scope.matchday !== null) query = query.eq('matchday', scope.matchday)

  const matches = tournamentId ? rows<ListMatch>(await query, 'the matches') : []

  /*
    What each team played in this scope, counted here because this is where the
    matches are. Every team goes in, zeros included: it is also the list of ids
    the two client components validate `?equipo=` against, and a team that did
    not play this matchday is still a team you can choose - and be told so.
  */
  const counts: Record<string, number> = Object.fromEntries(teams.map((team) => [team.id, 0]))
  for (const match of matches) {
    for (const side of [match.blue_team_id, match.red_team_id]) {
      if (side !== null && side in counts) counts[side] += 1
    }
  }

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
          <MatchCount counts={counts} total={matches.length} matchday={scope.matchday} />
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

      {teams.length > 0 && (
        <MatchFilters teams={teams} matchday={scope.matchday} counts={counts} />
      )}

      {matches.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line-strong px-6 py-14 text-center">
          {/*
            Three texts because these are three different situations. With a
            matchday picked, what is missing is not that anything be played: it
            is loosening the filter. With no filter and a session this is a
            working screen and what is missing is uploading the files. With no
            session it is somebody who came to watch the tournament: asking them
            to upload a .rofl is asking for something they cannot do, in a word
            they may not even know.

            The fourth - a team that played nothing in this matchday - is the
            `#sin-equipo` note further down, because which team is picked is
            decided in the browser.
          */}
          <p className="text-fg-soft">
            {scope.matchday !== null
              ? 'Ninguna partida en esta fecha. Probá con otra.'
              : user
                ? 'Subí los .rofl de las partidas jugadas para empezar.'
                : `Todavía no se jugó ninguna partida. La ${TOURNAMENT.name} arranca el ${tournamentStartDate()}.`}
          </p>
        </div>
      ) : (
        <>
          {/*
            No `highlight`: which team is marked is decided in the browser, and
            `MatchFilters` writes that rule along with the one that hides the
            rows. On a team's page, where the listing is already about one team,
            it is this component that writes it.
          */}
          <MatchList
            from="partidas"
            matches={matches}
            playersByMatch={playersByMatch}
            statsByMatch={statsByMatch}
            version={version}
            championNames={champNames}
          />

          {/*
            The other empty state: matches were played in this matchday, but none
            of them by the team that is picked. It is drawn hidden and the filter's
            rule brings it out, because which team that is is decided in the
            browser - and with the scripting off, by this same page's server
            render of that rule.
          */}
          <div
            id="sin-equipo"
            hidden
            className="rounded-lg border border-dashed border-line-strong px-6 py-14 text-center"
          >
            <p className="text-fg-soft">
              Este equipo no jugó ninguna partida en este recorte. Probá con otra fecha.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
