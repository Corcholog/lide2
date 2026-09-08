'use client'

import { useSearchParams } from 'next/navigation'
import { countCut, type MatchCut } from '@/components/match/cut'
import { markRule } from '@/components/match/mark'
import { ScopeNav } from '@/components/stats/ScopeNav'
import { parseMatchday, parseTeamFilter } from '@/lib/stats/scope'
import { GROUP_OPTIONS } from '@/lib/stats/tables'
import { withQuery } from '@/lib/url'

/**
 * The match listing's two filters: the matchday and the team.
 *
 * NEITHER OF THEM GOES TO THE SERVER, and that is the whole point of this
 * component. The listing loads every match of the phase - about forty, each
 * with its detail preloaded, which is what makes the rows expand without a
 * request - so the matches of any one team, or of any one matchday, ARE ALREADY
 * DRAWN before either is picked. Asking the server to render a subset of what
 * the browser is already holding is a round trip that buys nothing, and it was
 * the entire wait: /partidas is `force-dynamic` and re-reads the matches, the
 * ten scoreboards of each one and the per-team totals on every change.
 *
 * So the choice is written into the URL with `history.pushState` - which Next
 * syncs into `useSearchParams` without navigating - and honoured by CSS rules
 * that hide the rows left out. Nothing re-renders: those rows are the server's
 * HTML and this never touches them.
 *
 * THE URL IS STILL THE STATE. `?fecha=` and `?equipo=` mean what they always
 * meant, the link can still be pasted, and back and forward still work -
 * `popstate` is another thing Next syncs. What changed is who honours them: the
 * rules below, instead of a second server render.
 *
 * WITHOUT JAVASCRIPT both still filter. The `<form method="get">` submits and
 * the chips are real links, the page navigates for real, and this same
 * component - rendered on the server, where `useSearchParams` reads the URL of
 * the request - writes those same rules into the HTML. That is what the submit
 * button hidden by `.sin-js` is for.
 *
 * THE COUNT AND THE EMPTY NOTE ARE HERE for the same reason: they are the two
 * things that have to change when the cut does, and the server is no longer
 * being asked. The note sits above the listing rather than below it, which is
 * where an empty listing leaves room for it anyway.
 */
export function MatchFilters({
  teams,
  matches,
}: {
  teams: { id: string; name: string; group_label: string | null }[]
  /** Every match of the phase, reduced to what the filters ask about. */
  matches: MatchCut[]
}) {
  const params = useSearchParams()

  /*
    The same parsers the server used to call, now called here: a `?fecha=` that
    is not a matchday and an `?equipo=` that is not one of the tournament's
    teams are no filter at all, and that has to be decided in one place -
    otherwise a pasted uuid empties the listing on one side and not on the other.
  */
  const matchday = parseMatchday(params.get('fecha') ?? undefined)
  const team = parseTeamFilter(
    params.get('equipo') ?? undefined,
    teams.map((entry) => entry.id),
  )

  const shown = countCut(matches, matchday, team)
  const rules = cutRules(matchday, team)

  /*
    Both filters travel together, always: picking a matchday must not wipe the
    team, and the other way round. It is the same rule `withQuery` exists for,
    and the reason this is one function and not one per control.
  */
  const go = (next: { fecha?: number | null; equipo?: string | null }) => {
    window.history.pushState(
      null,
      '',
      withQuery('/partidas', { fecha: matchday, equipo: team, ...next }),
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {rules !== '' && <style>{rules}</style>}

      <ScopeNav
        base="/partidas"
        matchday={matchday}
        query={{ equipo: team }}
        onPick={(fecha) => go({ fecha })}
      />

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
          key={team ?? 'todos'}
          id="filtro-equipo"
          name="equipo"
          defaultValue={team ?? ''}
          onChange={(event) => go({ equipo: event.target.value || null })}
          className="border-2 border-line-strong bg-raised px-3 py-1.5 text-sm focus:border-accent"
        >
          <option value="">Todos</option>
          {/*
            Bucketed by group: with twenty teams called "Equipo 01" through
            "Equipo 20", knowing which group each one is in is the only way to
            find the one you want without reading them all.
          */}
          {GROUP_OPTIONS.map((group) => {
            const inGroup = teams.filter((entry) => entry.group_label === group.label)
            if (inGroup.length === 0) return null

            return (
              <optgroup key={group.id} label={group.label}>
                {inGroup.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </optgroup>
            )
          })}
          {/* The ones with no group assigned yet cannot just be hidden. */}
          {teams.some((entry) => entry.group_label === null) && (
            <optgroup label="Sin grupo">
              {teams
                .filter((entry) => entry.group_label === null)
                .map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
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

      {/*
        Matches were played, but none of them in this cut. The page's own empty
        state answers the other case - nothing uploaded at all - because that
        one does not depend on the filters and is the server's to know.
      */}
      {matches.length > 0 && shown === 0 && (
        <div className="rounded-lg border border-dashed border-line-strong px-6 py-14 text-center">
          <p className="text-fg-soft">
            {team !== null && matchday !== null
              ? 'Este equipo no jugó ninguna partida en esta fecha. Probá con otra.'
              : team !== null
                ? 'Este equipo todavía no tiene ninguna partida cargada.'
                : 'Ninguna partida en esta fecha. Probá con otra.'}
          </p>
        </div>
      )}
    </div>
  )
}

/**
 * The cut itself, written as CSS: which rows stay, and the team marked in the
 * ones that do.
 *
 * The matchday is a number off a closed list and the team an id checked against
 * the tournament's, which is what makes them safe to interpolate into a
 * selector: `parseMatchday` and `parseTeamFilter` run before this, and anything
 * they do not recognise is not a filter at all.
 *
 * `~=` matches one word of `data-equipos`, which carries the match's two team
 * ids: the row stays if the chosen team is one of the two. `data-fecha` is a
 * single value, so that one is a plain match - and a match with no matchday,
 * which carries no attribute, is correctly left out of every fecha.
 *
 * THE MARK IS THE OTHER HALF of picking a team, and not decoration: cut to one,
 * every row still reads "A against B" with nothing saying which of the two you
 * asked for. It is `markRule`, the same rule a team's page writes on the
 * server, which is what keeps the two looking alike.
 */
function cutRules(matchday: number | null, teamId: string | null): string {
  const rules: string[] = []

  if (matchday !== null) {
    rules.push(`#partidas > li:not([data-fecha="${matchday}"]) { display: none }`)
  }

  if (teamId !== null) {
    rules.push(`#partidas > li:not([data-equipos~="${teamId}"]) { display: none }`)
    rules.push(markRule(teamId))
  }

  return rules.join(' ')
}
