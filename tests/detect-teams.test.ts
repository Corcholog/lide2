import { describe, expect, it } from 'vitest'
import { detectTeams, type Lineup } from '../src/lib/teams/detect'

function lineup(matchId: string, side: 100 | 200, puuids: string[], fileNames: string[]): Lineup {
  return { matchId, side, puuids, fileNames }
}

describe('detección de equipos', () => {
  it('agrupa alineaciones que comparten 3 o más jugadores', () => {
    const teams = detectTeams([
      lineup('m1', 100, ['a', 'b', 'c', 'd', 'e'], []),
      // Mismo equipo con un suplente: comparte 4.
      lineup('m2', 100, ['a', 'b', 'c', 'd', 'x'], []),
      lineup('m1', 200, ['f', 'g', 'h', 'i', 'j'], []),
    ])

    expect(teams).toHaveLength(2)
    expect(teams[0].lineups).toBe(2)
    expect(teams[0].puuids.slice(0, 4).sort()).toEqual(['a', 'b', 'c', 'd'])
    // El suplente queda último: jugó menos.
    expect(teams[0].puuids[5]).toBe('x')
  })

  it('no fusiona equipos que sólo comparten dos jugadores', () => {
    const teams = detectTeams([
      lineup('m1', 100, ['a', 'b', 'c', 'd', 'e'], []),
      lineup('m2', 100, ['a', 'b', 'v', 'w', 'z'], []),
    ])
    expect(teams).toHaveLength(2)
  })

  it('saca el nombre del número que se repite en todos sus archivos', () => {
    const teams = detectTeams([
      lineup('m1', 100, ['a', 'b', 'c', 'd', 'e'], ['E1vsE4-LEIF8-FECHA1-B.rofl']),
      lineup('m2', 100, ['a', 'b', 'c', 'd', 'e'], ['WINNERS(E1vsE6)-C-LEIF8-FECHA2.rofl']),
    ])

    // E1 está en las dos; E4 y E6 sólo en una.
    expect(teams[0].suggestedName).toBe('Equipo 1')
  })

  it('entiende también los nombres escritos con palabras', () => {
    const teams = detectTeams([
      lineup('m1', 100, ['a', 'b', 'c', 'd', 'e'], ['Fecha 3 Equipo 2 vs Equipo 9.rofl']),
      lineup('m2', 100, ['a', 'b', 'c', 'd', 'e'], ['E2vsE12-A-LEIF8-FECHA2.rofl']),
    ])
    expect(teams[0].suggestedName).toBe('Equipo 2')
  })

  it('no confunde LEIF8 ni los match id con nombres de equipo', () => {
    const teams = detectTeams([
      lineup('m1', 100, ['a', 'b', 'c', 'd', 'e'], ['WINNERS-B-LEIF8-FECHA1.rofl']),
      lineup('m2', 100, ['a', 'b', 'c', 'd', 'e'], ['LA2-1602356940.rofl']),
    ])
    expect(teams[0].suggestedName).toBeNull()
  })

  it('no arriesga un nombre cuando queda más de un candidato', () => {
    const teams = detectTeams([
      lineup('m1', 100, ['a', 'b', 'c', 'd', 'e'], ['E1vsE4-LEIF8-FECHA1-B.rofl']),
    ])
    expect(teams[0].suggestedName).toBeNull()
  })
})
