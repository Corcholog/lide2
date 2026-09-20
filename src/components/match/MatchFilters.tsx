'use client'

import type { MouseEvent } from 'react'
import { useSearchParams } from 'next/navigation'
import { countCut, type MatchCut } from '@/components/match/cut'
import { markRule } from '@/components/match/mark'
import { Chip } from '@/components/nav/Chip'
import { ROW } from '@/components/stats/ScopeNav'
import { parseScope, parseTeamFilter, scopeRows, scopeValue } from '@/lib/stats/scope'
import { GROUP_OPTIONS } from '@/lib/stats/tables'
import { withQuery } from '@/lib/url'

/**
 * The match listing's filters: the tournament cut and the team.
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

  /*
    The same parsers the stats pages use, so `?fecha=` means one thing across
    the site and a link carries between them. An unreadable value is ignored
    the same way on both sides.
  */
  const scope = parseScope(params.get('fecha') ?? undefined)
  const cut = scopeValue(scope)
  const team = parseTeamFilter(
    params.get('equipo') ?? undefined,
    teams.map((entry) => entry.id),
  )

  const shown = countCut(matches, cut, team)
  const rules = cutRules(cut, team)

  // Both filters always travel together, so changing one keeps the other.
  const go = (next: { fecha?: string | null; equipo?: string | null }) => {
    window.history.pushState(null, '', withQuery('/partidas', { fecha: cut, equipo: team, ...next }))
  }

  // Modified clicks (ctrl, cmd, shift, middle button) are left to the browser.
  const pick = (fecha: string | null) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    go({ fecha })
  }

  return (
    <div className="flex flex-col gap-3">
      {rules !== '' && <style>{rules}</style>}

      {/*
        The same picker as the stats pages, drawn from `scopeRows`, but wired
        to filter here instead of navigating: the page already holds every
        match. Chips stay real links so new tabs, sharing and no-JavaScript use
        keep working; a plain click only rewrites the URL. Nothing is
        prefetched, since nothing is fetched.
      */}
      {scopeRows(scope, 'Todas').map((row) => (
        <nav key={row.label} aria-label={row.label} className={ROW}>
          {row.chips.map((chip) => (
            <Chip
              key={chip.value ?? 'todas'}
              label={chip.label}
              href={withQuery('/partidas', { equipo: team, fecha: chip.value })}
              active={cut === chip.value}
              prefetch={false}
              onClick={pick(chip.value)}
            />
          ))}
        </nav>
      ))}

      <form method="get" action="/partidas" className="flex flex-wrap items-center gap-2">
        {cut !== null && <input type="hidden" name="fecha" value={cut} />}

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
            {team !== null && cut !== null
              ? 'Este equipo no jugó ninguna partida en este recorte. Probá con otro.'
              : team !== null
                ? 'Este equipo todavía no tiene ninguna partida cargada.'
                : 'Ninguna partida en este recorte. Probá con otro.'}
          </p>
        </div>
      )}
    </div>
  )
}

/**
 * The filters as CSS: hides the rows outside the cut and marks the team.
 *
 * Safe to interpolate: the cut comes from `parseScope`, which only ever returns
 * values from a fixed list, and the team id was checked against the
 * tournament's teams.
 *
 * Both rules use `~=`, which matches one word of a space-separated attribute:
 * one of the two ids in `data-equipos`, and one of the values in
 * `data-recorte`. A match whose phase is unresolved carries no `data-recorte`
 * at all, so any cut hides it.
 */
function cutRules(cut: string | null, teamId: string | null): string {
  const rules: string[] = []

  if (cut !== null) {
    rules.push(`#partidas > li:not([data-recorte~="${cut}"]) { display: none }`)
  }

  if (teamId !== null) {
    rules.push(`#partidas > li:not([data-equipos~="${teamId}"]) { display: none }`)
    rules.push(markRule(teamId))
  }

  return rules.join(' ')
}
