import { describe, expect, it } from 'vitest'
import { championIndex, resolveChampion } from '../src/lib/champions/catalog'
import { championKey, championLoading, roflKey } from '../src/lib/ddragon'

/** A subset of ddragon's catalog, with the most often misspelled names. */
const CATALOG = [
  { key: 'MonkeyKing', name: 'Wukong' },
  { key: 'Kaisa', name: "Kai'Sa" },
  { key: 'DrMundo', name: 'Dr. Mundo' },
  { key: 'Chogath', name: "Cho'Gath" },
  { key: 'Fiddlesticks', name: 'Fiddlesticks' },
  { key: 'Nunu', name: 'Nunu y Willump' },
  { key: 'Ahri', name: 'Ahri' },
]

const index = championIndex(CATALOG)

describe('resolveChampion', () => {
  it('finds by the name that is shown', () => {
    expect(resolveChampion(index, 'Wukong')).toBe('MonkeyKing')
  })

  it('finds by the internal key, which is what the .rofl stores', () => {
    expect(resolveChampion(index, 'MonkeyKing')).toBe('MonkeyKing')
  })

  it('is case-insensitive', () => {
    expect(resolveChampion(index, 'wukong')).toBe('MonkeyKing')
    expect(resolveChampion(index, 'AHRI')).toBe('Ahri')
  })

  it('ignores apostrophes, dots and spaces', () => {
    expect(resolveChampion(index, "Kai'Sa")).toBe('Kaisa')
    expect(resolveChampion(index, 'kaisa')).toBe('Kaisa')
    expect(resolveChampion(index, 'KAI SA')).toBe('Kaisa')
    expect(resolveChampion(index, 'Dr. Mundo')).toBe('DrMundo')
    expect(resolveChampion(index, 'drmundo')).toBe('DrMundo')
    expect(resolveChampion(index, "cho'gath")).toBe('Chogath')
    expect(resolveChampion(index, 'Nunu y Willump')).toBe('Nunu')
  })

  it('ignores accents somebody might type in', () => {
    expect(resolveChampion(index, 'Áhri')).toBe('Ahri')
  })

  it('trims the surrounding spaces', () => {
    expect(resolveChampion(index, '  Ahri  ')).toBe('Ahri')
  })

  it('returns null for a champion that does not exist', () => {
    expect(resolveChampion(index, 'NotAChampion')).toBeNull()
  })

  it('returns null for an empty field', () => {
    expect(resolveChampion(index, '')).toBeNull()
    expect(resolveChampion(index, '   ')).toBeNull()
  })
})

describe('roflKey', () => {
  it('goes back to the .rofl spelling', () => {
    expect(roflKey('Fiddlesticks')).toBe('FiddleSticks')
  })

  it('leaves the ones that are not exceptions alone', () => {
    expect(roflKey('MonkeyKing')).toBe('MonkeyKing')
  })

  it('is the inverse of championKey', () => {
    // The two mappings must round-trip, or stored bans would not match picks and
    // the champion would be counted twice.
    expect(championKey(roflKey('Fiddlesticks'))).toBe('Fiddlesticks')
  })
})

describe('championLoading', () => {
  it('points at the base skin through the proxy, with no version', () => {
    expect(championLoading('Ahri')).toBe('/api/ddragon/cdn/img/champion/loading/Ahri_0.jpg')
  })

  it('builds the path with the ddragon key and not the .rofl spelling', () => {
    // CDN paths are case-sensitive, as for icons.
    expect(championLoading('FiddleSticks')).toBe(
      '/api/ddragon/cdn/img/champion/loading/Fiddlesticks_0.jpg',
    )
  })
})
