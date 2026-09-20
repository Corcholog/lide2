import { describe, expect, it } from 'vitest'
import { countCut, type MatchCut } from '@/components/match/cut'
import { parseScope, scopeRows, scopeValue, scopesOf } from '@/lib/stats/scope'

/*
 * The /partidas filter, which runs in the browser rather than as a query: the
 * page holds every match and CSS hides the rest.
 *
 * The thing worth pinning is that the count and the CSS agree. Both read the
 * same list from `scopesOf` -- one as `data-recorte`, the other here -- so a
 * match can never be hidden while still being counted, or the page would say
 * "12 partidas" over an empty list.
 */

const GROUP_2 = { phase: 'grupos' as const, matchday: 2, round_label: 'Fecha 2' }
const QUARTER = { phase: 'playoffs' as const, matchday: null, round_label: 'Cuartos de final' }
/** Uploaded but not assigned to a matchup or a series yet. */
const LOOSE = { phase: null, matchday: null, round_label: null }

describe('scopesOf', () => {
  it('puts a group match in its phase and its matchday', () => {
    expect(scopesOf(GROUP_2)).toEqual(['grupos', '2'])
  })

  it('puts a playoff match in its phase and its round', () => {
    expect(scopesOf(QUARTER)).toEqual(['playoffs', 'cuartos'])
  })

  /* It belongs to no cut, so only the unfiltered list shows it. */
  it('gives a match with no phase nothing to match on', () => {
    expect(scopesOf(LOOSE)).toEqual([])
  })

  /*
   * The bridge to the picker: every chip has to name a cut some match can
   * actually be in. A chip whose value no match ever carries would look like a
   * filter and always come back empty.
   */
  it('speaks the same values the chips send', () => {
    const chips = [
      ...scopeRows(parseScope('grupos')).flatMap((row) => row.chips),
      ...scopeRows(parseScope('playoffs')).flatMap((row) => row.chips),
    ]
      .map((chip) => chip.value)
      .filter((value) => value !== null)

    const played = [...scopesOf(GROUP_2), ...scopesOf(QUARTER)]
    const groups = ['grupos', '1', '2', '3']
    const rounds = ['playoffs', 'cuartos', 'semis', 'final']

    expect([...new Set(chips)].sort()).toEqual([...groups, ...rounds].sort())
    // The two sample matches cover one chip of each row.
    expect(played.every((value) => chips.includes(value))).toBe(true)
  })
})

describe('countCut', () => {
  const matches: MatchCut[] = [
    { scopes: scopesOf(GROUP_2), teams: ['a', 'b'] },
    { scopes: scopesOf({ ...GROUP_2, matchday: 3, round_label: 'Fecha 3' }), teams: ['a', 'c'] },
    { scopes: scopesOf(QUARTER), teams: ['a', 'b'] },
    { scopes: scopesOf(LOOSE), teams: ['d', 'e'] },
  ]

  /** What the chip with this label would show. */
  const shown = (value: string | null, team: string | null = null) =>
    countCut(matches, value, team)

  it('counts every match with no filter, the unassigned one included', () => {
    expect(shown(null)).toBe(4)
  })

  it('counts a whole phase', () => {
    expect(shown('grupos')).toBe(2)
    expect(shown('playoffs')).toBe(1)
  })

  it('counts one matchday and one round', () => {
    expect(shown('2')).toBe(1)
    expect(shown('cuartos')).toBe(1)
    expect(shown('semis')).toBe(0)
  })

  it('leaves an unassigned match out of every cut', () => {
    for (const value of ['grupos', 'playoffs', '2', 'cuartos']) {
      expect(shown(value)).toBeLessThan(4)
    }
  })

  it('crosses the cut with the team', () => {
    expect(shown('grupos', 'a')).toBe(2)
    expect(shown('grupos', 'b')).toBe(1)
    expect(shown('playoffs', 'c')).toBe(0)
    expect(shown(null, 'a')).toBe(3)
  })

  /* The value comes from the URL through the same parser the chips write to. */
  it('reads the cut the URL carries', () => {
    expect(shown(scopeValue(parseScope('cuartos')))).toBe(1)
    expect(shown(scopeValue(parseScope('basura')))).toBe(4)
  })
})
