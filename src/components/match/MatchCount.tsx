'use client'

import { useSearchParams } from 'next/navigation'
import { parseTeamFilter } from '@/lib/stats/scope'

/**
 * How many matches the listing is showing, the line under the title.
 *
 * It reads the URL instead of being handed a number because the team filter no
 * longer goes to the server (see `MatchFilters`): as server-rendered text this
 * line would keep saying sixty while the listing showed four, which is worse
 * than not having it at all.
 *
 * The matchday IS still a server filter, so `total` arrives already cut to it.
 */
export function MatchCount({
  counts,
  total,
  matchday,
}: {
  /** How many matches of this scope each team played. Every team is in here. */
  counts: Record<string, number>
  total: number
  matchday: number | null
}) {
  const team = parseTeamFilter(useSearchParams().get('equipo') ?? undefined, Object.keys(counts))
  const shown = team === null ? total : counts[team]

  return (
    <p className="mt-1 text-sm text-muted">
      {total === 0
        ? 'Todavía no hay partidas cargadas.'
        : `${shown} partida${shown === 1 ? '' : 's'}${
            team !== null || matchday !== null ? ' en este recorte' : ' cargadas'
          }.`}
    </p>
  )
}
