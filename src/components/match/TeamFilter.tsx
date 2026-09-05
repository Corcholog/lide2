'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { GROUP_OPTIONS } from '@/lib/stats/tables'
import { withQuery } from '@/lib/url'

/**
 * The team filter on the match listing.
 *
 * A `<select>` and not a row of chips: there are twenty teams, and twenty chips
 * do not fit on any screen. It still follows the same rule as the site's other
 * filters - the state travels in the URL, not in React - so the listing stays a
 * server component and the scope can be shared by pasting the link.
 *
 * PICKING A TEAM IS THE FILTER. It used to take a second click on a "Filtrar"
 * button, which is a step that exists only because a `<form>` needs submitting:
 * nobody opens a dropdown, chooses a team and means "not yet". Choosing
 * navigates now, and the button is left for whoever has no JavaScript - the
 * `<form method="get">` around it is what makes that work at all - hidden by
 * `.sin-js`, which globals.css explains.
 *
 * The `<input hidden>` is what preserves the matchday when the team changes;
 * `ScopeNav` does the reverse with its `query` prop. The URL is built with the
 * same `withQuery` so the two agree on what an empty parameter means: gone, not
 * `?equipo=`.
 */
export function TeamFilter({
  teams,
  selected,
  matchday,
}: {
  teams: { id: string; name: string; group_label: string | null }[]
  selected: string | null
  matchday: number | null
}) {
  const router = useRouter()
  /*
    The navigation goes in a transition so the dropdown does not sit there
    looking broken while the server renders the new listing: /partidas is
    `force-dynamic` and re-reads every match of the cut. It is the only thing
    this component keeps in React, and it is about the wait, not about the
    filter - which still lives entirely in the URL.
  */
  const [pending, startTransition] = useTransition()

  return (
    <form method="get" action="/partidas" className="flex flex-wrap items-center gap-2">
      {matchday !== null && <input type="hidden" name="fecha" value={matchday} />}

      <label htmlFor="filtro-equipo" className="text-xs font-bold uppercase tracking-wide text-faint">
        Equipo
      </label>

      {/*
        The `key` is the team the URL holds today, the same trick as
        `AssignAccount`. The field is uncontrolled - `defaultValue` only lands
        on mount - so pressing back would leave the listing filtered by one
        team and the dropdown naming another. Keyed, the URL changing rebuilds
        it and the two cannot drift apart.
      */}
      <select
        key={selected ?? 'todos'}
        id="filtro-equipo"
        name="equipo"
        defaultValue={selected ?? ''}
        aria-busy={pending}
        onChange={(event) => {
          const equipo = event.target.value || null
          startTransition(() => {
            router.push(withQuery('/partidas', { fecha: matchday, equipo }))
          })
        }}
        className={`border-2 border-line-strong bg-raised px-3 py-1.5 text-sm transition-opacity focus:border-accent ${
          pending ? 'opacity-60' : ''
        }`}
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
  )
}
