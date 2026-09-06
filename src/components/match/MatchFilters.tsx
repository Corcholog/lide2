'use client'

import { useSearchParams } from 'next/navigation'
import { ScopeNav } from '@/components/stats/ScopeNav'
import { parseTeamFilter } from '@/lib/stats/scope'
import { GROUP_OPTIONS } from '@/lib/stats/tables'
import { withQuery } from '@/lib/url'

/**
 * The match listing's two filters: the matchday and the team.
 *
 * THE TEAM FILTER DOES NOT GO TO THE SERVER, and that is the whole point of
 * this component. The listing already loads every match of the tournament -
 * about sixty, each with its detail preloaded, which is what makes the rows
 * expand without a request - so the matches of any one team ARE ALREADY DRAWN
 * before it is picked. Asking the server to render a subset of what the browser
 * is already holding is a round trip that buys nothing, and it was the entire
 * wait: /partidas is `force-dynamic` and re-reads the matches, the ten
 * scoreboards of each one and the per-team totals on every change.
 *
 * So the choice is written into the URL with `history.pushState` - which Next
 * syncs into `useSearchParams` without navigating - and honoured by one CSS
 * rule that hides the other teams' rows. Nothing re-renders: those rows are the
 * server's HTML and this never touches them.
 *
 * THE URL IS STILL THE STATE. `?equipo=` means what it always meant, the link
 * can still be pasted, and back and forward still work - `popstate` is another
 * thing Next syncs. What changed is who honours it: the rule below, instead of
 * a second server render.
 *
 * WITHOUT JAVASCRIPT the `<form method="get">` submits and the page navigates
 * for real, and this same component - rendered on the server, where
 * `useSearchParams` reads the URL of the request - writes that same rule into
 * the HTML. The filter works with the scripting off, which is what the submit
 * button hidden by `.sin-js` is for.
 *
 * THE MATCHDAY IS STILL A SERVER FILTER: it changes which matches get read at
 * all. It is rendered from in here so its links carry whichever team is chosen:
 * they are built once, and after a `pushState` the server has not re-rendered
 * them.
 */
export function MatchFilters({
  teams,
  matchday,
  counts,
}: {
  teams: { id: string; name: string; group_label: string | null }[]
  matchday: number | null
  /** How many matches of this scope each team played. Every team is in here. */
  counts: Record<string, number>
}) {
  /*
    The same parser the server used to call, now called here: an `?equipo=` that
    is not one of the tournament's teams is no filter at all, and that has to be
    decided in one place - otherwise a pasted uuid empties the listing on one
    side and not on the other.
  */
  const selected = parseTeamFilter(
    useSearchParams().get('equipo') ?? undefined,
    Object.keys(counts),
  )

  return (
    <div className="flex flex-col gap-3">
      {selected !== null && <style>{filterRule(selected, counts[selected] === 0)}</style>}

      <ScopeNav base="/partidas" matchday={matchday} query={{ equipo: selected }} />

      <form method="get" action="/partidas" className="flex flex-wrap items-center gap-2">
        {matchday !== null && <input type="hidden" name="fecha" value={matchday} />}

        <label
          htmlFor="filtro-equipo"
          className="text-xs font-bold uppercase tracking-wide text-faint"
        >
          Equipo
        </label>

        {/*
          The `key` is the team the URL holds, the same trick as `AssignAccount`.
          The field is uncontrolled - `defaultValue` only lands on mount - so
          pressing back would leave the listing filtered by one team and the
          dropdown naming another. Keyed, the URL changing rebuilds it and the
          two cannot drift apart.
        */}
        <select
          key={selected ?? 'todos'}
          id="filtro-equipo"
          name="equipo"
          defaultValue={selected ?? ''}
          onChange={(event) => {
            const equipo = event.target.value || null
            window.history.pushState(null, '', withQuery('/partidas', { fecha: matchday, equipo }))
          }}
          className="border-2 border-line-strong bg-raised px-3 py-1.5 text-sm focus:border-accent"
        >
          <option value="">Todos</option>
          {/*
            Bucketed by group: with twenty teams called "Equipo 01" through
            "Equipo 20", knowing which group each one is in is the only way to
            find the one you want without reading them all.
          */}
          {GROUP_OPTIONS.map((group) => {
            const inGroup = teams.filter((team) => team.group_label === group.label)
            if (inGroup.length === 0) return null

            return (
              <optgroup key={group.id} label={group.label}>
                {inGroup.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </optgroup>
            )
          })}
          {/* The ones with no group assigned yet cannot just be hidden. */}
          {teams.some((team) => team.group_label === null) && (
            <optgroup label="Sin grupo">
              {teams
                .filter((team) => team.group_label === null)
                .map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
            </optgroup>
          )}
        </select>

        <button
          type="submit"
          className="sin-js border-2 border-line-strong px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-muted transition-colors hover:border-accent hover:text-accent"
        >
          Filtrar
        </button>
      </form>
    </div>
  )
}

/**
 * The filter itself, written as CSS.
 *
 * `~=` matches one word of `data-equipos`, which carries the match's two team
 * ids: the row stays if the chosen team is one of the two. When that team has
 * nothing in this matchday the listing goes and the note takes its place, which
 * is the case the server used to answer with an empty list.
 *
 * The id is interpolated into a selector, so it can only ever be one that came
 * out of the database: `parseTeamFilter` checks it against the tournament's
 * teams before it gets here, and anything else is not a filter at all.
 */
function filterRule(teamId: string, empty: boolean): string {
  const hide = `#partidas > li:not([data-equipos~="${teamId}"]) { display: none }`

  return empty ? `${hide} #partidas { display: none } #sin-equipo { display: block }` : hide
}
