import { GRUPOS } from '@/lib/stats/tablas'

/**
 * El filtro por equipo del listado de partidas.
 *
 * Un `<form method="get">` y no una hilera de chips: son veinte equipos, y
 * veinte chips no entran en ninguna pantalla. Igual sigue la misma regla que el
 * resto de los filtros del sitio —el estado viaja en la URL, no en React—, así
 * que la página sigue siendo un componente de servidor, el recorte se puede
 * compartir pegando el link y anda sin JavaScript.
 *
 * El `<input hidden>` es lo que conserva la fecha al cambiar de equipo; en el
 * sentido inverso lo hace `ScopeNav` con su prop `query`.
 */
export function FiltroEquipo({
  equipos,
  equipo,
  fecha,
}: {
  equipos: { id: string; name: string; group_label: string | null }[]
  equipo: string | null
  fecha: number | null
}) {
  return (
    <form method="get" action="/partidas" className="flex flex-wrap items-center gap-2">
      {fecha !== null && <input type="hidden" name="fecha" value={fecha} />}

      <label htmlFor="filtro-equipo" className="text-xs font-bold uppercase tracking-wide text-faint">
        Equipo
      </label>

      <select
        id="filtro-equipo"
        name="equipo"
        defaultValue={equipo ?? ''}
        className="border-2 border-line-strong bg-raised px-3 py-1.5 text-sm focus:border-accent"
      >
        <option value="">Todos</option>
        {/*
          Agrupados por grupo: con veinte equipos que se llaman "Equipo 01" a
          "Equipo 20", saber en qué grupo está cada uno es la única forma de
          encontrar el que se busca sin leerlos todos.
        */}
        {GRUPOS.map((grupo) => {
          const delGrupo = equipos.filter((e) => e.group_label === grupo.label)
          if (delGrupo.length === 0) return null

          return (
            <optgroup key={grupo.id} label={grupo.label}>
              {delGrupo.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </optgroup>
          )
        })}
        {/* Los que todavía no tienen grupo asignado no se pueden esconder. */}
        {equipos.some((e) => e.group_label === null) && (
          <optgroup label="Sin grupo">
            {equipos
              .filter((e) => e.group_label === null)
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
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
