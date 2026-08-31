import { describe, expect, it } from 'vitest'
import { parseTeamOrder, sortTeams, type OrderableTeam } from '../src/lib/teams/order'

/**
 * En qué orden se listan los equipos en /equipos.
 *
 * Lo que importa acá es el winrate: no es una columna de `team_totals` —hay que
 * dividir— y los casos de borde son los que se ven raro en pantalla, sobre todo
 * el equipo que todavía no jugó nada.
 */

function equipo(name: string, wins: number, games: number): OrderableTeam {
  return { name, wins, games }
}

describe('parseTeamOrder', () => {
  it('el default es alfabético', () => {
    expect(parseTeamOrder(undefined)).toBe('alfabetico')
    expect(parseTeamOrder('')).toBe('alfabetico')
    expect(parseTeamOrder('cualquier-cosa')).toBe('alfabetico')
    // `?orden=winrate&orden=x` llega como arreglo: no es el pedido de nadie.
    expect(parseTeamOrder(['winrate'])).toBe('alfabetico')
  })

  it('winrate es el único que se pide por URL', () => {
    expect(parseTeamOrder('winrate')).toBe('winrate')
  })
})

describe('sortTeams', () => {
  it('alfabético ordena por nombre y no toca el arreglo original', () => {
    const teams = [equipo('Equipo 03', 0, 3), equipo('Equipo 01', 3, 3), equipo('Equipo 02', 1, 3)]
    const ordenados = sortTeams(teams, 'alfabetico')

    expect(ordenados.map((t) => t.name)).toEqual(['Equipo 01', 'Equipo 02', 'Equipo 03'])
    expect(teams[0].name).toBe('Equipo 03')
  })

  it('alfabético cuenta los números como números', () => {
    // Sin `numeric`, "Equipo 10" iría antes que "Equipo 2".
    const teams = [equipo('Equipo 10', 0, 0), equipo('Equipo 2', 0, 0)]
    expect(sortTeams(teams, 'alfabetico').map((t) => t.name)).toEqual(['Equipo 2', 'Equipo 10'])
  })

  it('winrate ordena por porcentaje, no por victorias', () => {
    // El 3–3 tiene más victorias que el 2–0, y va abajo igual.
    const teams = [equipo('Tres y tres', 3, 6), equipo('Dos de dos', 2, 2)]
    expect(sortTeams(teams, 'winrate').map((t) => t.name)).toEqual(['Dos de dos', 'Tres y tres'])
  })

  it('a igual porcentaje, primero el que jugó más', () => {
    const teams = [equipo('Uno de uno', 1, 1), equipo('Tres de tres', 3, 3)]
    expect(sortTeams(teams, 'winrate').map((t) => t.name)).toEqual(['Tres de tres', 'Uno de uno'])
  })

  it('el que no jugó nada va último, no primero', () => {
    // 0 de 0 no es 0%: es que no se sabe, y la card muestra "—".
    const teams = [equipo('Sin jugar', 0, 0), equipo('Perdió todo', 0, 4), equipo('Ganó', 2, 4)]
    expect(sortTeams(teams, 'winrate').map((t) => t.name)).toEqual([
      'Ganó',
      'Perdió todo',
      'Sin jugar',
    ])
  })

  it('entre los que no jugaron nada manda el alfabético', () => {
    const teams = [equipo('Equipo 02', 0, 0), equipo('Equipo 01', 0, 0)]
    expect(sortTeams(teams, 'winrate').map((t) => t.name)).toEqual(['Equipo 01', 'Equipo 02'])
  })

  it('el orden es el mismo siempre: dos equipos idénticos no se turnan', () => {
    const teams = [equipo('Equipo 02', 2, 4), equipo('Equipo 01', 2, 4)]
    const una = sortTeams(teams, 'winrate').map((t) => t.name)
    const otra = sortTeams([...teams].reverse(), 'winrate').map((t) => t.name)

    expect(una).toEqual(['Equipo 01', 'Equipo 02'])
    expect(otra).toEqual(una)
  })
})
