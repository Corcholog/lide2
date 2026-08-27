import { describe, expect, it } from 'vitest'
import { matchRosterLines } from '@/lib/roster/import'
import { parseRiotId } from '@/lib/format'

/**
 * El pegado de la lista de Riot IDs.
 *
 * Los nombres son los de verdad del Equipo 15, que es el caso feo: cinco
 * personas de tres universidades, con acentos y con la planilla escrita en tres
 * formatos distintos.
 */
const EQUIPO_15 = [
  { rosterId: 'r1', fullName: 'Denis Chang', teamName: 'Equipo 15' },
  { rosterId: 'r2', fullName: 'Alexis Maximiliano Costas', teamName: 'Equipo 15' },
  { rosterId: 'r3', fullName: 'Maria Teresita pereyra potel', teamName: 'Equipo 15' },
  { rosterId: 'r4', fullName: 'Fernando Luis Guzmán Rivadineira', teamName: 'Equipo 15' },
  { rosterId: 'r5', fullName: 'Gabriel Pareja', teamName: 'Equipo 15' },
]

describe('parseRiotId', () => {
  it('corta por el ultimo #, porque el nombre puede tener espacios y el tag no', () => {
    expect(parseRiotId('DenisChang#LAN')).toEqual({ gameName: 'DenisChang', tagLine: 'LAN' })
    expect(parseRiotId('  el gabo #ARG1 ')).toEqual({ gameName: 'el gabo', tagLine: 'ARG1' })
  })

  it('sin tag devuelve solo el nombre', () => {
    expect(parseRiotId('DenisChang')).toEqual({ gameName: 'DenisChang', tagLine: null })
  })

  it('lo vacio no es un Riot ID', () => {
    expect(parseRiotId('')).toBeNull()
    expect(parseRiotId('   ')).toBeNull()
    expect(parseRiotId('#LAN')).toBeNull()
  })
})

describe('importar la lista de Riot IDs', () => {
  it('aguanta columnas de mas y separadores distintos', () => {
    const result = matchRosterLines(
      [
        'Equipo 15, Denis Chang, DenisChang#LAN',
        'Gabriel Pareja; ElGabo#ARG1',
        '15 | Alexis Maximiliano Costas | Alexis#LAS | titular',
      ].join('\n'),
      EQUIPO_15,
    )

    expect(result.matched.map((m) => [m.rosterId, m.gameName, m.tagLine])).toEqual([
      ['r1', 'DenisChang', 'LAN'],
      ['r5', 'ElGabo', 'ARG1'],
      ['r2', 'Alexis', 'LAS'],
    ])
    expect(result.unmatched).toEqual([])
    expect(result.ambiguous).toEqual([])
  })

  it('encuentra el nombre aunque venga dado vuelta o sin acentos', () => {
    const result = matchRosterLines(
      ['pereyra potel, Maria Teresita, Tere#LAN', 'Guzman Rivadineira Fernando Luis; Fer#LAN'].join(
        '\n',
      ),
      EQUIPO_15,
    )

    expect(result.matched.map((m) => m.rosterId)).toEqual(['r3', 'r4'])
  })

  it('lo que no encuentra a nadie se reporta, no se descarta en silencio', () => {
    const result = matchRosterLines('Juan Perez, JuanP#LAN', EQUIPO_15)

    expect(result.matched).toEqual([])
    expect(result.unmatched).toEqual(['Juan Perez, JuanP#LAN'])
  })

  it('con dos candidatos no elige: avisa cuales colisionaron', () => {
    const roster = [
      { rosterId: 'a', fullName: 'Gabriel Pareja', teamName: 'Equipo 15' },
      { rosterId: 'b', fullName: 'Gabriel', teamName: 'Equipo 03' },
    ]
    const result = matchRosterLines('Gabriel Pareja, ElGabo#ARG1', roster)

    expect(result.matched).toEqual([])
    expect(result.ambiguous).toEqual([
      { line: 'Gabriel Pareja, ElGabo#ARG1', names: ['Gabriel Pareja', 'Gabriel'] },
    ])
  })

  it('una misma persona no se lleva dos Riot IDs', () => {
    const result = matchRosterLines(
      ['Denis Chang, DenisChang#LAN', 'Denis Chang, OtroNick#LAN'].join('\n'),
      EQUIPO_15,
    )

    expect(result.matched).toHaveLength(1)
    expect(result.matched[0].gameName).toBe('DenisChang')
    expect(result.unmatched).toHaveLength(1)
  })

  it('una linea sin nombre no alcanza', () => {
    const result = matchRosterLines('DenisChang#LAN', EQUIPO_15)
    expect(result.matched).toEqual([])
    expect(result.unmatched).toEqual(['DenisChang#LAN'])
  })
})
