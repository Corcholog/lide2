import { describe, expect, it } from 'vitest'
import { parseTeamOrder, sortTeams, type OrderableTeam } from '../src/lib/teams/order'

/**
 * The order teams are listed in on /equipos.
 *
 * What matters here is the win rate: it is not a `team_totals` column - it has
 * to be divided out - and the edge cases are the ones that look odd on screen,
 * above all the team that has not played anything yet.
 */

function team(name: string, wins: number, games: number): OrderableTeam {
  return { name, wins, games }
}

describe('parseTeamOrder', () => {
  it('the default is alphabetical', () => {
    expect(parseTeamOrder(undefined)).toBe('alfabetico')
    expect(parseTeamOrder('')).toBe('alfabetico')
    expect(parseTeamOrder('cualquier-cosa')).toBe('alfabetico')
    // `?orden=winrate&orden=x` arrives as an array: it is nobody's request.
    expect(parseTeamOrder(['winrate'])).toBe('alfabetico')
  })

  it('winrate is the only one that can be asked for by URL', () => {
    expect(parseTeamOrder('winrate')).toBe('winrate')
  })
})

describe('sortTeams', () => {
  it('alphabetical orders by name and does not touch the original array', () => {
    const teams = [team('Equipo 03', 0, 3), team('Equipo 01', 3, 3), team('Equipo 02', 1, 3)]
    const sorted = sortTeams(teams, 'alfabetico')

    expect(sorted.map((t) => t.name)).toEqual(['Equipo 01', 'Equipo 02', 'Equipo 03'])
    expect(teams[0].name).toBe('Equipo 03')
  })

  it('alphabetical counts the numbers as numbers', () => {
    // Without `numeric`, "Equipo 10" would come before "Equipo 2".
    const teams = [team('Equipo 10', 0, 0), team('Equipo 2', 0, 0)]
    expect(sortTeams(teams, 'alfabetico').map((t) => t.name)).toEqual(['Equipo 2', 'Equipo 10'])
  })

  it('winrate orders by percentage, not by wins', () => {
    // The 3-3 has more wins than the 2-0, and still goes below.
    const teams = [team('Tres y tres', 3, 6), team('Dos de dos', 2, 2)]
    expect(sortTeams(teams, 'winrate').map((t) => t.name)).toEqual(['Dos de dos', 'Tres y tres'])
  })

  it('on equal percentage, whoever played more comes first', () => {
    const teams = [team('Uno de uno', 1, 1), team('Tres de tres', 3, 3)]
    expect(sortTeams(teams, 'winrate').map((t) => t.name)).toEqual(['Tres de tres', 'Uno de uno'])
  })

  it('whoever played nothing goes last, not first', () => {
    // 0 out of 0 is not 0%: it is unknown, and the card shows an em dash.
    const teams = [team('Sin jugar', 0, 0), team('Perdió todo', 0, 4), team('Ganó', 2, 4)]
    expect(sortTeams(teams, 'winrate').map((t) => t.name)).toEqual([
      'Ganó',
      'Perdió todo',
      'Sin jugar',
    ])
  })

  it('among those who played nothing the alphabet rules', () => {
    const teams = [team('Equipo 02', 0, 0), team('Equipo 01', 0, 0)]
    expect(sortTeams(teams, 'winrate').map((t) => t.name)).toEqual(['Equipo 01', 'Equipo 02'])
  })

  it('the order is always the same: two identical teams do not take turns', () => {
    const teams = [team('Equipo 02', 2, 4), team('Equipo 01', 2, 4)]
    const una = sortTeams(teams, 'winrate').map((t) => t.name)
    const otra = sortTeams([...teams].reverse(), 'winrate').map((t) => t.name)

    expect(una).toEqual(['Equipo 01', 'Equipo 02'])
    expect(otra).toEqual(una)
  })
})
