import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { daysUntil } from '@/lib/lide2/dates'

/*
 * The countdown behind the hero's big number and the final's card.
 *
 * It counts calendar days in Argentina, not milliseconds, so a date reads 0 for
 * the whole day it is played regardless of the hour.
 */

/** Sets the clock to a moment in UTC. */
function now(iso: string) {
  vi.setSystemTime(new Date(iso))
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('daysUntil', () => {
  it('reads 0 all through the day itself', () => {
    now('2026-09-19T03:30:00.000Z') // half past midnight in Argentina
    expect(daysUntil('2026-09-19T15:00:00.000Z')).toBe(0)

    now('2026-09-20T02:00:00.000Z') // 23:00 the same day in Argentina
    expect(daysUntil('2026-09-19T15:00:00.000Z')).toBe(0)
  })

  it('counts a date already played as negative', () => {
    now('2026-09-19T15:00:00.000Z')
    expect(daysUntil('2026-09-12T15:00:00.000Z')).toBe(-7)
  })

  it('counts within the same month', () => {
    now('2026-09-19T15:00:00.000Z')
    expect(daysUntil('2026-09-26T15:00:00.000Z')).toBe(7)
  })

  /*
   * The regression: treating the 1-based month as 0-based moved both dates a
   * month forward, into months of different lengths, so every count that
   * crossed a month boundary came out a day long. September has 30 days and
   * October 31, which made the final read 29 days away instead of 28.
   */
  it('counts across a month boundary', () => {
    now('2026-09-19T15:00:00.000Z')
    expect(daysUntil('2026-10-03T15:00:00.000Z')).toBe(14)
    expect(daysUntil('2026-10-17T15:00:00.000Z')).toBe(28)
  })

  it('counts across the end of the year', () => {
    now('2026-12-28T15:00:00.000Z')
    expect(daysUntil('2027-01-04T15:00:00.000Z')).toBe(7)
  })
})
