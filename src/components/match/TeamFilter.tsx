import { GROUP_OPTIONS } from '@/lib/stats/tables'

/**
 * The team filter on the match listing.
 *
 * A `<form method="get">` and not a row of chips: there are twenty teams, and
 * twenty chips do not fit on any screen. It still follows the same rule as the
 * site's other filters - the state travels in the URL, not in React - so the
 * page stays a server component, the scope can be shared by pasting the link
 * and it works without JavaScript.
 *
 * The `<input hidden>` is what preserves the matchday when the team changes;
 * `ScopeNav` does the reverse with its `query` prop.
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
  return (
    <form method="get" action="/partidas" className="flex flex-wrap items-center gap-2">
      {matchday !== null && <input type="hidden" name="fecha" value={matchday} />}

      <label htmlFor="filtro-equipo" className="text-xs font-bold uppercase tracking-wide text-faint">
        Equipo
      </label>

      <select
        id="filtro-equipo"
        name="equipo"
        defaultValue={selected ?? ''}
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
        className="border-2 border-line-strong px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-muted transition-colors hover:border-accent hover:text-accent"
      >
        Filtrar
      </button>
    </form>
  )
}
