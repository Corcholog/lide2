import { describe, expect, it } from 'vitest'
import { matchRosterLines } from '@/lib/roster/import'
import { parseRiotId } from '@/lib/format'

/**
 * Pasting a list of Riot IDs, using a mixed team with accented names written in
 * three different formats.
 */
const TEAM_15 = [
  { rosterId: 'r1', fullName: 'Dario Ferro', teamName: 'Equipo 15' },
  { rosterId: 'r2', fullName: 'Andrea Sol Aranda', teamName: 'Equipo 15' },
  { rosterId: 'r3', fullName: 'Mariel Beatriz ferrari soto', teamName: 'Equipo 15' },
  { rosterId: 'r4', fullName: 'Fabián Tadeo Echeverría Ocampo', teamName: 'Equipo 15' },
  { rosterId: 'r5', fullName: 'Gregorio Aguilar', teamName: 'Equipo 15' },
]

describe('parseRiotId', () => {
  it('splits on the last #, because the name may have spaces and the tag may not', () => {
    expect(parseRiotId('DarioFerro#LAN')).toEqual({ gameName: 'DarioFerro', tagLine: 'LAN' })
    expect(parseRiotId('  el goyo #ARG1 ')).toEqual({ gameName: 'el goyo', tagLine: 'ARG1' })
  })

  it('with no tag it returns the name alone', () => {
    expect(parseRiotId('DarioFerro')).toEqual({ gameName: 'DarioFerro', tagLine: null })
  })

  it('an empty value is not a Riot ID', () => {
    expect(parseRiotId('')).toBeNull()
    expect(parseRiotId('   ')).toBeNull()
    expect(parseRiotId('#LAN')).toBeNull()
  })
})

describe('importing the list of Riot IDs', () => {
  it('survives extra columns and different separators', () => {
    const result = matchRosterLines(
      [
        'Equipo 15, Dario Ferro, DarioFerro#LAN',
        'Gregorio Aguilar; ElGoyo#ARG1',
        '15 | Andrea Sol Aranda | Andrea#LAS | titular',
      ].join('\n'),
      TEAM_15,
    )

    expect(result.matched.map((m) => [m.rosterId, m.gameName, m.tagLine])).toEqual([
      ['r1', 'DarioFerro', 'LAN'],
      ['r5', 'ElGoyo', 'ARG1'],
      ['r2', 'Andrea', 'LAS'],
    ])
    expect(result.unmatched).toEqual([])
    expect(result.ambiguous).toEqual([])
  })

  it('finds the name even reversed or without accents', () => {
    const result = matchRosterLines(
      ['ferrari soto, Mariel Beatriz, Mari#LAN', 'Echeverria Ocampo Fabián Tadeo; Fabi#LAN'].join(
        '\n',
      ),
      TEAM_15,
    )

    expect(result.matched.map((m) => m.rosterId)).toEqual(['r3', 'r4'])
  })

  it('whatever finds nobody is reported, not silently discarded', () => {
    const result = matchRosterLines('Juan Perez, JuanP#LAN', TEAM_15)

    expect(result.matched).toEqual([])
    expect(result.unmatched).toEqual(['Juan Perez, JuanP#LAN'])
  })

  it('with two candidates it does not choose: it says which collided', () => {
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

  it('one person does not take two Riot IDs', () => {
    const result = matchRosterLines(
      ['Dario Ferro, DarioFerro#LAN', 'Dario Ferro, OtroNick#LAN'].join('\n'),
      TEAM_15,
    )

    expect(result.matched).toHaveLength(1)
    expect(result.matched[0].gameName).toBe('DarioFerro')
    expect(result.unmatched).toHaveLength(1)
  })

  it('a line with no name is not enough', () => {
    const result = matchRosterLines('DarioFerro#LAN', TEAM_15)
    expect(result.matched).toEqual([])
    expect(result.unmatched).toEqual(['DarioFerro#LAN'])
  })
})
