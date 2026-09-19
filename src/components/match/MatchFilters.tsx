'use client'

import type { MouseEvent } from 'react'
import { useSearchParams } from 'next/navigation'
import { countCut, type MatchCut } from '@/components/match/cut'
import { markRule } from '@/components/match/mark'
import { Chip } from '@/components/nav/Chip'
import { MATCHDAYS, parseMatchday, parseTeamFilter } from '@/lib/stats/scope'
import { GROUP_OPTIONS } from '@/lib/stats/tables'
import { withQuery } from '@/lib/url'

/**
 * The match listing's filters: matchday and team.
 *
 * Neither goes to the server. The page already renders every match of the
 * phase with its detail, so filtering writes the choice to the URL with
 * `history.pushState` (Next syncs it into `useSearchParams` without navigating)
 * and CSS rules hide the other rows. Nothing re-renders, and the URL remains
 * the state: links can be shared and back/forward work.
 *
 * Without JavaScript the chips are real links and the form submits, and this
 * component, rendered on the server, writes the same rules into the HTML.
 * The count and the empty-state note live here because they change with the
 * filters.
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

  // The same parsers the server uses, so an invalid `?fecha=` or unknown
  // `?equipo=` is ignored the same way on both sides.
  const matchday = parseMatchday(params.get('fecha') ?? undefined)
  const team = parseTeamFilter(
    params.get('equipo') ?? undefined,
    teams.map((entry) => entry.id),
  )

  const shown = countCut(matches, matchday, team)
  const rules = cutRules(matchday, team)

  // Both filters always travel together, so changing one keeps the other.
  const go = (next: { fecha?: number | null; equipo?: string | null }) => {
    window.history.pushState(
      null,
      '',
      withQuery('/partidas', { fecha: matchday, equipo: team, ...next }),
    )
  }

  // Modified clicks (ctrl, cmd, shift, middle button) are left to the browser.
  const pick = (fecha: number | null) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    go({ fecha })
  }

  return (
    <div className="flex flex-col gap-3">
      {rules !== '' && <style>{rules}</style>}

      {/*
        Its own row rather than the stats pages' `ScopeNav`: this one filters
        in the browser by matchday, and playoff matches have no matchday (their
        scope is the round). Chips stay real links so new tabs, sharing and
        no-JavaScript use keep working; a plain click only rewrites the URL.
      */}
      <nav
        aria-label="Fecha"
        className="flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:pb-0"
      >
        {[{ matchday: null, label: 'Todas' }, ...MATCHDAYS].map((entry) => (
          <Chip
            key={entry.matchday ?? 'todas'}
            label={entry.label}
            href={withQuery('/partidas', { equipo: team, fecha: entry.matchday })}
            active={matchday === entry.matchday}
            prefetch={false}
            onClick={pick(entry.matchday)}
          />
        ))}
      </nav>

      <form method="get" action="/partidas" className="flex flex-wrap items-center gap-2">
        {matchday !== null && <input type="hidden" name="fecha" value={matchday} />}

        <label
          htmlFor="filtro-equipo"
          className="text-xs font-bold uppercase tracking-wide text-faint"
        >
          Equipo
        </label>

        {/*
          Keyed by the URL's team: the select is uncontrolled, so without the key
          going back in history would leave it showing a different team than the
          filter.
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
          {/* Grouped by group, to find a team among twenty similar names. */}
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
          {/* Teams without a group are listed too. */}
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
        Matches exist but none in this cut. The page handles the case of no
        matches at all.
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
 * The filters as CSS: hides the rows outside the cut and marks the team.
 *
 * Safe to interpolate: the matchday comes from a fixed list and the team id was
 * checked against the tournament's teams. `~=` matches one of the two team ids
 * in `data-equipos`; matches without a matchday have no `data-fecha` and are
 * hidden under any matchday filter.
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
