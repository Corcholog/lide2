import { describe, expect, it } from 'vitest'
import { multisearchUrl, searchableCount, summonerUrl } from '@/lib/opgg'

/**
 * The op.gg multisearch link. The first test rebuilds a URL copied from op.gg's
 * own search box, character by character: the double comma, `+` for spaces and
 * `%23` for `#` all matter and cannot be verified by reading the code.
 */

const team = [
  { gameName: 'falling forever', tagLine: '1101' },
  { gameName: 'UNDAV Natko', tagLine: 'CARP' },
  { gameName: 'UNDAV Morey', tagLine: 'OLD' },
  { gameName: 'UNDAV Kempes', tagLine: 'ARG' },
  { gameName: 'El Barto', tagLine: 'XL55' },
]

describe('op.gg multisearch', () => {
  it('rebuilds a real op.gg link exactly', () => {
    expect(multisearchUrl(team)).toBe(
      'https://op.gg/es/lol/multisearch/las?summoners=falling+forever%231101%2C%2CUNDAV+Natko%23CARP%2C%2CUNDAV+Morey%23OLD%2C%2CUNDAV+Kempes%23ARG%2C%2CEl+Barto%23XL55',
    )
  })

  it('leaves out the accounts op.gg cannot resolve', () => {
    // Without a tag a Riot ID is not unique, so op.gg cannot resolve it.
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
    // It decodes back to the Riot ID.
    const value = new URL(url!).searchParams.get('summoners')
    expect(value).toBe('Ñandú & Co#LAS')
  })

  it('counts only what will end up in the link', () => {
    expect(searchableCount(team)).toBe(5)
    expect(searchableCount([...team, { gameName: 'SinTag', tagLine: null }])).toBe(5)
  })
})

/**
 * One player's op.gg page. Unlike the multisearch, the Riot ID is part of the
 * path: spaces are %20 and the `#` becomes a hyphen. The first test rebuilds a
 * URL copied from the browser.
 */
describe('op.gg summoner page', () => {
  it('rebuilds a real op.gg link exactly', () => {
    expect(summonerUrl({ gameName: 'Axitas Alexis 99', tagLine: 'LAS' })).toBe(
      'https://op.gg/es/lol/summoners/las/Axitas%20Alexis%2099-LAS',
    )
  })

  it('writes the spaces as a path does', () => {
    // The multisearch uses `+` for spaces, which in a path would be a literal plus.
    expect(summonerUrl({ gameName: 'falling forever', tagLine: '1101' })).toBe(
      'https://op.gg/es/lol/summoners/las/falling%20forever-1101',
    )
  })

  it('survives what a nick is allowed to contain', () => {
    const cases: [string, string, string][] = [
      // Non-ASCII: Riot IDs take any script, and a raw one would not be a URL.
      ['Ñandú', 'LAS', '%C3%91and%C3%BA-LAS'],
      // The characters that mean something in a URL.
      ['a/b?c#d', 'LAS', 'a%2Fb%3Fc%23d-LAS'],
      ['100%', 'LAS', '100%25-LAS'],
      ['El & Barto', 'XL55', 'El%20%26%20Barto-XL55'],
      // Dots and underscores are left as they are.
      ['jose.perez_77', 'LAS', 'jose.perez_77-LAS'],
      // A nick with its own hyphen: op.gg reads the tag after the last one.
      ['Jean-Luc', 'LAS', 'Jean-Luc-LAS'],
    ]

    for (const [gameName, tagLine, expected] of cases) {
      expect(summonerUrl({ gameName, tagLine })).toBe(
        `https://op.gg/es/lol/summoners/las/${expected}`,
      )
    }
  })

  it('comes back out as the Riot ID it was built from', () => {
    for (const account of [
      { gameName: 'Axitas Alexis 99', tagLine: 'LAS' },
      { gameName: 'Ñandú & Co', tagLine: 'LAS' },
      { gameName: '  Corcho  ', tagLine: ' fkc ' },
    ]) {
      const url = new URL(summonerUrl(account)!)
      const slug = decodeURIComponent(url.pathname.split('/').pop()!)

      expect(slug).toBe(`${account.gameName.trim()}-${account.tagLine.trim()}`)
    }
  })

  it('gives nothing without a tag, same as the multisearch', () => {
    expect(summonerUrl({ gameName: 'SinTag', tagLine: null })).toBeNull()
    expect(summonerUrl({ gameName: null, tagLine: 'huerfano' })).toBeNull()
    expect(summonerUrl({ gameName: '   ', tagLine: 'vacio' })).toBeNull()
  })
})
