/**
 * En qué orden se listan los equipos en /equipos.
 *
 * Dos órdenes y nada más, porque responden a dos preguntas distintas:
 * alfabético es "¿dónde está el mío?" —con veinte equipos que se llaman
 * "Equipo 01".."Equipo 20", buscar el propio es lo que más se hace— y winrate
 * es "¿quién va ganando?". El primero es el default: sirve aunque no se haya
 * jugado nada, y el otro no.
 *
 * Va acá y no en el `order by` de la consulta porque el winrate no es una
 * columna: `team_totals` trae `wins` y `games` sueltos, y ordenar por victorias
 * pone a un 3–3 por encima de un 2–0.
 */

export type TeamOrder = 'alfabetico' | 'winrate'

/** Lo que necesita saber de un equipo para ordenarlo. */
export interface OrderableTeam {
  name: string
  games: number
  wins: number
}

/**
 * El orden pedido por la URL. Cualquier cosa que no sea `winrate` —vacío, una
 * palabra inventada, el `?orden=` repetido— cae en el default.
 */
export function parseTeamOrder(value: string | string[] | undefined): TeamOrder {
  return value === 'winrate' ? 'winrate' : 'alfabetico'
}

/**
 * Alfabético de verdad: `localeCompare` con `numeric` para que "Equipo 2" vaya
 * antes que "Equipo 10". Hoy los nombres vienen con cero adelante y el orden de
 * texto alcanzaría, pero eso es una convención del seed, no una garantía.
 */
function porNombre(a: OrderableTeam, b: OrderableTeam): number {
  return a.name.localeCompare(b.name, 'es', { numeric: true, sensitivity: 'base' })
}

/**
 * Ordena sin tocar el arreglo original.
 *
 * En winrate, un equipo que todavía no jugó va último y no primero: 0 de 0 no
 * es 0%, es que no se sabe —la card muestra "—"— y arrancar la lista con los
 * que no jugaron nada es justo lo contrario de lo que se viene a ver. Entre dos
 * con el mismo porcentaje va antes el que jugó más partidas, porque un 100% en
 * tres partidas dice más que un 100% en una.
 */
export function sortTeams<T extends OrderableTeam>(teams: T[], order: TeamOrder): T[] {
  if (order === 'alfabetico') return [...teams].sort(porNombre)

  return [...teams].sort((a, b) => {
    if (a.games === 0 || b.games === 0) {
      if (a.games !== b.games) return a.games === 0 ? 1 : -1
      return porNombre(a, b)
    }

    const winrate = b.wins / b.games - a.wins / a.games
    if (winrate !== 0) return winrate
    if (b.games !== a.games) return b.games - a.games
    return porNombre(a, b)
  })
}
