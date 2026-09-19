import { describe, expect, it } from 'vitest'
import { groupsFinished, isDecided } from '@/lib/lide2/fixture'
import type { FixtureResultRow } from '@/types/db'

/*
 * Whether the group phase is over, which is what turns the home page's copy
 * from "clasifican" to "clasificaron".
 *
 * It reads results rather than the calendar, so the last matchday counts as
 * over the moment its games are in. That is only visible on the day itself,
 * which is why it is tested here.
 */

/** A `fixture_results` row with only the field these functions read. */
function matchup(status: FixtureResultRow['status']): FixtureResultRow {
  return { status } as FixtureResultRow
}

describe('isDecided', () => {
  it('counts a played matchup', () => {
    expect(isDecided(matchup('jugado'))).toBe(true)
  })

  /* Neither produces a game, but both settle who goes through. */
  it('counts a walkover and a ruling, which have no game', () => {
    expect(isDecided(matchup('w.o.'))).toBe(true)
    expect(isDecided(matchup('reglamento'))).toBe(true)
  })

  it('does not count a matchup still to be played', () => {
    expect(isDecided(matchup('pendiente'))).toBe(false)
  })

  /*
   * A matchup whose replay was never uploaded. It was played, but nothing says
   * who won, so the standings are not final.
   */
  it('does not count a matchup with no result loaded', () => {
    expect(isDecided(matchup('sin resultado'))).toBe(false)
  })
})

describe('groupsFinished', () => {
  it('is over once every matchup is decided', () => {
    expect(groupsFinished([matchup('jugado'), matchup('w.o.'), matchup('reglamento')])).toBe(true)
  })

  it('is not over while one matchup is left', () => {
    expect(groupsFinished([matchup('jugado'), matchup('pendiente')])).toBe(false)
  })

  /* Before the seed runs there is no fixture, which is not a finished one. */
  it('is not over when there is no fixture at all', () => {
    expect(groupsFinished([])).toBe(false)
  })
})
