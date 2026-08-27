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
  { rosterId: 'r1', fullName: 'Dario Ferro', teamName: 'Equipo 15' },
  { rosterId: 'r2', fullName: 'Andrea Sol Aranda', teamName: 'Equipo 15' },
  { rosterId: 'r3', fullName: 'Mariel Beatriz ferrari soto', teamName: 'Equipo 15' },
  { rosterId: 'r4', fullName: 'Fabián Tadeo Echeverría Ocampo', teamName: 'Equipo 15' },
  { rosterId: 'r5', fullName: 'Gregorio Aguilar', teamName: 'Equipo 15' },
]

describe('parseRiotId', () => {
  it('corta por el ultimo #, porque el nombre puede tener espacios y el tag no', () => {
    expect(parseRiotId('DarioFerro#LAN')).toEqual({ gameName: 'DarioFerro', tagLine: 'LAN' })
    expect(parseRiotId('  el goyo #ARG1 ')).toEqual({ gameName: 'el goyo', tagLine: 'ARG1' })
  })

  it('sin tag devuelve solo el nombre', () => {
    expect(parseRiotId('DarioFerro')).toEqual({ gameName: 'DarioFerro', tagLine: null })
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
        'Equipo 15, Dario Ferro, DarioFerro#LAN',
        'Gregorio Aguilar; ElGoyo#ARG1',
        '15 | Andrea Sol Aranda | Andrea#LAS | titular',
      ].join('\n'),
      EQUIPO_15,
    )

    expect(result.matched.map((m) => [m.rosterId, m.gameName, m.tagLine])).toEqual([
      ['r1', 'DarioFerro', 'LAN'],
      ['r5', 'ElGoyo', 'ARG1'],
      ['r2', 'Andrea', 'LAS'],
    ])
    expect(result.unmatched).toEqual([])
    expect(result.ambiguous).toEqual([])
  })

  it('encuentra el nombre aunque venga dado vuelta o sin acentos', () => {
    const result = matchRosterLines(
      ['ferrari soto, Mariel Beatriz, Mari#LAN', 'Echeverria Ocampo Fabián Tadeo; Fabi#LAN'].join(
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
      { rosterId: 'a', fullName: 'Gregorio Aguilar', teamName: 'Equipo 15' },
      { rosterId: 'b', fullName: 'Gregorio', teamName: 'Equipo 03' },
    ]
    const result = matchRosterLines('Gregorio Aguilar, ElGoyo#ARG1', roster)

    expect(result.matched).toEqual([])
    expect(result.ambiguous).toEqual([
      { line: 'Gregorio Aguilar, ElGoyo#ARG1', names: ['Gregorio Aguilar', 'Gregorio'] },
    ])
  })

  it('una misma persona no se lleva dos Riot IDs', () => {
    const result = matchRosterLines(
      ['Dario Ferro, DarioFerro#LAN', 'Dario Ferro, OtroNick#LAN'].join('\n'),
      EQUIPO_15,
    )

    expect(result.matched).toHaveLength(1)
    expect(result.matched[0].gameName).toBe('DarioFerro')
    expect(result.unmatched).toHaveLength(1)
  })

  it('una linea sin nombre no alcanza', () => {
    const result = matchRosterLines('DarioFerro#LAN', EQUIPO_15)
    expect(result.matched).toEqual([])
    expect(result.unmatched).toEqual(['DarioFerro#LAN'])
  })
})
