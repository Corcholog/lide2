import { describe, expect, it } from 'vitest'
import { currentTab } from '@/components/nav/current'

/*
 * Which tab the home page's fixture and bracket open on.
 *
 * It can only be seen live on the day a round is being played, so the rule is
 * tested here: the tabs follow the tournament instead of always opening on its
 * first round.
 */

describe('currentTab', () => {
  it('opens the first round still being played', () => {
    expect(currentTab([true, false, false])).toBe(1)
  })

  it('opens the first round when nothing has been played', () => {
    expect(currentTab([false, false, false])).toBe(0)
  })

  it('stays on the last round once the tournament is over', () => {
    expect(currentTab([true, true, true])).toBe(2)
  })

  /*
   * A later round can be decided before an earlier one: a walkover in the
   * semifinals while a quarter-final is still being replayed. The unfinished
   * round is the one to show.
   */
  it('prefers the earliest unfinished round over a later decided one', () => {
    expect(currentTab([true, false, true])).toBe(1)
  })

  /* The bracket renders before any series exists; Tabs clamps, but so does this. */
  it('gives a usable index with no rounds at all', () => {
    expect(currentTab([])).toBe(0)
  })
})
