import { describe, expect, it } from 'vitest'
import { detectTeams, type Lineup } from '../src/lib/teams/detect'

function lineup(matchId: string, side: 100 | 200, puuids: string[], fileNames: string[]): Lineup {
  return { matchId, side, puuids, fileNames }
}

describe('team detection', () => {
  it('groups lineups that share 3 or more players', () => {
    const teams = detectTeams([
      lineup('m1', 100, ['a', 'b', 'c', 'd', 'e'], []),
      // Same team with a substitute: it shares 4.
      lineup('m2', 100, ['a', 'b', 'c', 'd', 'x'], []),
      lineup('m1', 200, ['f', 'g', 'h', 'i', 'j'], []),
    ])

    expect(teams).toHaveLength(2)
    expect(teams[0].lineups).toBe(2)
    expect(teams[0].puuids.slice(0, 4).sort()).toEqual(['a', 'b', 'c', 'd'])
    // The substitute goes last: they played less.
    expect(teams[0].puuids[5]).toBe('x')
  })

  it('does not merge teams that share only two players', () => {
    const teams = detectTeams([
      lineup('m1', 100, ['a', 'b', 'c', 'd', 'e'], []),
      lineup('m2', 100, ['a', 'b', 'v', 'w', 'z'], []),
    ])
    expect(teams).toHaveLength(2)
  })

  it('takes the name from the number repeated across all its files', () => {
    const teams = detectTeams([
      lineup('m1', 100, ['a', 'b', 'c', 'd', 'e'], ['E1vsE4-LEIF8-FECHA1-B.rofl']),
      lineup('m2', 100, ['a', 'b', 'c', 'd', 'e'], ['WINNERS(E1vsE6)-C-LEIF8-FECHA2.rofl']),
    ])

    // E1 is in both; E4 and E6 in only one.
    expect(teams[0].suggestedName).toBe('Equipo 1')
  })

  it('understands names written out in words too', () => {
    const teams = detectTeams([
      lineup('m1', 100, ['a', 'b', 'c', 'd', 'e'], ['Fecha 3 Equipo 2 vs Equipo 9.rofl']),
      lineup('m2', 100, ['a', 'b', 'c', 'd', 'e'], ['E2vsE12-A-LEIF8-FECHA2.rofl']),
    ])
    expect(teams[0].suggestedName).toBe('Equipo 2')
  })

  it('does not mistake LEIF8 or the match ids for team names', () => {
    const teams = detectTeams([
      lineup('m1', 100, ['a', 'b', 'c', 'd', 'e'], ['WINNERS-B-LEIF8-FECHA1.rofl']),
      lineup('m2', 100, ['a', 'b', 'c', 'd', 'e'], ['LA2-1602356940.rofl']),
    ])
    expect(teams[0].suggestedName).toBeNull()
  })

  it('does not risk a name when more than one candidate is left', () => {
    const teams = detectTeams([
      lineup('m1', 100, ['a', 'b', 'c', 'd', 'e'], ['E1vsE4-LEIF8-FECHA1-B.rofl']),
    ])
    expect(teams[0].suggestedName).toBeNull()
  })
})
