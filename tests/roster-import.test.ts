import { describe, expect, it } from 'vitest'
import { matchRosterLines } from '@/lib/roster/import'
import { parseRiotId } from '@/lib/format'

/**
 * Pasting the list of Riot IDs.
 *
 * The names are Team 15's real ones, which is the ugly case: five people from
 * three universities, with accents and with the sheet written in three
 * different formats.
 */
const TEAM_15 = [
  { rosterId: 'r1', fullName: 'Denis Chang', teamName: 'Equipo 15' },
  { rosterId: 'r2', fullName: 'Alexis Maximiliano Costas', teamName: 'Equipo 15' },
  { rosterId: 'r3', fullName: 'Maria Teresita pereyra potel', teamName: 'Equipo 15' },
  { rosterId: 'r4', fullName: 'Fernando Luis Guzmán Rivadineira', teamName: 'Equipo 15' },
  { rosterId: 'r5', fullName: 'Gabriel Pareja', teamName: 'Equipo 15' },
]

describe('parseRiotId', () => {
  it('splits on the last #, because the name may have spaces and the tag may not', () => {
    expect(parseRiotId('DenisChang#LAN')).toEqual({ gameName: 'DenisChang', tagLine: 'LAN' })
    expect(parseRiotId('  el gabo #ARG1 ')).toEqual({ gameName: 'el gabo', tagLine: 'ARG1' })
  })

  it('with no tag it returns the name alone', () => {
    expect(parseRiotId('DenisChang')).toEqual({ gameName: 'DenisChang', tagLine: null })
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
        'Equipo 15, Denis Chang, DenisChang#LAN',
        'Gabriel Pareja; ElGabo#ARG1',
        '15 | Alexis Maximiliano Costas | Alexis#LAS | titular',
      ].join('\n'),
      TEAM_15,
    )

    expect(result.matched.map((m) => [m.rosterId, m.gameName, m.tagLine])).toEqual([
      ['r1', 'DenisChang', 'LAN'],
      ['r5', 'ElGabo', 'ARG1'],
      ['r2', 'Alexis', 'LAS'],
    ])
    expect(result.unmatched).toEqual([])
    expect(result.ambiguous).toEqual([])
  })

  it('finds the name even reversed or without accents', () => {
    const result = matchRosterLines(
      ['pereyra potel, Maria Teresita, Tere#LAN', 'Guzman Rivadineira Fernando Luis; Fer#LAN'].join(
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
      { rosterId: 'a', fullName: 'Gabriel Pareja', teamName: 'Equipo 15' },
      { rosterId: 'b', fullName: 'Gabriel', teamName: 'Equipo 03' },
    ]
    const result = matchRosterLines('Gabriel Pareja, ElGabo#ARG1', roster)

    expect(result.matched).toEqual([])
    expect(result.ambiguous).toEqual([
      { line: 'Gabriel Pareja, ElGabo#ARG1', names: ['Gabriel Pareja', 'Gabriel'] },
    ])
  })

  it('one person does not take two Riot IDs', () => {
    const result = matchRosterLines(
      ['Denis Chang, DenisChang#LAN', 'Denis Chang, OtroNick#LAN'].join('\n'),
      TEAM_15,
    )

    expect(result.matched).toHaveLength(1)
    expect(result.matched[0].gameName).toBe('DenisChang')
    expect(result.unmatched).toHaveLength(1)
  })

  it('a line with no name is not enough', () => {
    const result = matchRosterLines('DenisChang#LAN', TEAM_15)
    expect(result.matched).toEqual([])
    expect(result.unmatched).toEqual(['DenisChang#LAN'])
  })
})
