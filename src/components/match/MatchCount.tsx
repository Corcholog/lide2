'use client'

import { useSearchParams } from 'next/navigation'
import { countCut, type MatchCut } from '@/components/match/cut'
import { parseScope, parseTeamFilter, scopeValue } from '@/lib/stats/scope'

/**
 * How many matches the listing is showing, the line under the title.
 *
 * It reads the URL and counts here instead of being handed a number because
 * NEITHER of the two filters goes to the server any more (see `MatchFilters`):
 * as server-rendered text this line would keep saying forty while the listing
 * showed eight, which is worse than not having it at all.
 */
export function MatchCount({
  matches,
  teamIds,
}: {
  /** Every match of the phase, reduced to what the filters ask about. */
  matches: MatchCut[]
  /** The tournament's teams, to tell a filter from a made-up `?equipo=`. */
  teamIds: string[]
}) {
  const params = useSearchParams()
  const cut = scopeValue(parseScope(params.get('fecha') ?? undefined))
  const team = parseTeamFilter(params.get('equipo') ?? undefined, teamIds)

  const shown = countCut(matches, cut, team)

  return (
    <p className="mt-1 text-sm text-muted">
      {matches.length === 0
        ? 'Todavía no hay partidas cargadas.'
        : `${shown} partida${shown === 1 ? '' : 's'}${
            cut !== null || team !== null ? ' en este recorte' : ' cargadas'
          }.`}
    </p>
  )
}
