import { describe, expect, it } from 'vitest'
import { multisearchUrl, searchableCount } from '@/lib/opgg'

/**
 * The op.gg multisearch link.
 *
 * The first test is the whole point of the file: a URL copied from op.gg's own
 * multisearch box, rebuilt from its five accounts and compared character by
 * character. Everything about the format that is not obvious - the double
 * comma, `+` instead of `%20`, `#` as `%23` - is load-bearing and none of it
 * can be checked by reading the code.
 */

const equipo = [
  { gameName: 'falling forever', tagLine: '1101' },
  { gameName: 'UNDAV Natko', tagLine: 'CARP' },
  { gameName: 'UNDAV Morey', tagLine: 'OLD' },
  { gameName: 'UNDAV Kempes', tagLine: 'ARG' },
  { gameName: 'El Barto', tagLine: 'XL55' },
]

describe('op.gg multisearch', () => {
  it('rebuilds a real op.gg link exactly', () => {
    expect(multisearchUrl(equipo)).toBe(
      'https://op.gg/es/lol/multisearch/las?summoners=falling+forever%231101%2C%2CUNDAV+Natko%23CARP%2C%2CUNDAV+Morey%23OLD%2C%2CUNDAV+Kempes%23ARG%2C%2CEl+Barto%23XL55',
    )
  })

  it('leaves out the accounts op.gg cannot resolve', () => {
    // A Riot ID without its tag is not unique, so op.gg cannot look it up:
    // including it would put a dud in the search, not that person.
    const url = multisearchUrl([
      { gameName: 'Corcho', tagLine: 'fkc' },
      { gameName: 'SinTag', tagLine: null },
      { gameName: null, tagLine: 'huerfano' },
      { gameName: '   ', tagLine: 'vacio' },
    ])

    expect(url).toBe('https://op.gg/es/lol/multisearch/las?summoners=Corcho%23fkc')
    expect(searchableCount([{ gameName: 'SinTag', tagLine: null }])).toBe(0)
  })

  it('does not search the same account twice', () => {
    const url = multisearchUrl([
      { gameName: 'Corcho', tagLine: 'fkc' },
      { gameName: 'Corcho', tagLine: 'fkc' },
      { gameName: 'Pachu', tagLine: '777' },
    ])

    expect(url).toBe(
      'https://op.gg/es/lol/multisearch/las?summoners=Corcho%23fkc%2C%2CPachu%23777',
    )
  })

  it('gives nothing when there is nothing to look up', () => {
    expect(multisearchUrl([])).toBeNull()
    expect(multisearchUrl([{ gameName: 'SinTag', tagLine: null }])).toBeNull()
  })

  it('encodes what a nick is allowed to contain', () => {
    // Riot IDs take spaces and non-ASCII; a raw one would break the query.
    const url = multisearchUrl([{ gameName: 'Ñandú & Co', tagLine: 'LAS' }])

    expect(url).toBe(
      'https://op.gg/es/lol/multisearch/las?summoners=%C3%91and%C3%BA+%26+Co%23LAS',
    )
    // And it survives the round trip back to the Riot ID.
    const value = new URL(url!).searchParams.get('summoners')
    expect(value).toBe('Ñandú & Co#LAS')
  })

  it('counts only what will end up in the link', () => {
    expect(searchableCount(equipo)).toBe(5)
    expect(searchableCount([...equipo, { gameName: 'SinTag', tagLine: null }])).toBe(5)
  })
})
