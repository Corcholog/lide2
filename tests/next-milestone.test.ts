import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { milestonePlayed, nextMilestone } from '@/lib/lide2/dates'
import { CALENDAR } from '@/lib/lide2/tournament'

/*
 * The date the hero counts down to, and how the calendar marks the ones behind
 * us.
 *
 * The case worth pinning down is the evening of the last group matchday: its
 * games are in, so the phase is over, but its own date has not passed yet.
 * Without that the page spends the night counting down to "¡HOY! Fecha 3" with
 * the groups already decided.
 */

/** Noon in Argentina on the given day, so the clock is nowhere near midnight. */
function today(date: string) {
  vi.setSystemTime(new Date(`${date}T15:00:00.000Z`))
}

const milestone = (id: string) => CALENDAR.find((entry) => entry.id === id)!

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('nextMilestone', () => {
  it('counts down to the matchday being played while the groups are open', () => {
    today('2026-09-19')
    expect(nextMilestone(false)?.id).toBe('fecha-3')
  })

  it('moves to the quarter-finals once the last group games are in', () => {
    today('2026-09-19')
    expect(nextMilestone(true)?.id).toBe('cuartos')
  })

  it('follows the dates through the playoffs, which the fixture says nothing about', () => {
    today('2026-09-28')
    expect(nextMilestone(true)?.id).toBe('semis')
  })

  it('has nothing left after the final', () => {
    today('2026-10-18')
    expect(nextMilestone(true)).toBeUndefined()
  })
})

describe('milestonePlayed', () => {
  it('marks the last group matchday as played on its own evening', () => {
    today('2026-09-19')
    expect(milestonePlayed(milestone('fecha-3'), true)).toBe(true)
    expect(milestonePlayed(milestone('fecha-3'), false)).toBe(false)
  })

  /* Finished groups say nothing about a playoff round that has not happened. */
  it('leaves an upcoming playoff round alone', () => {
    today('2026-09-19')
    expect(milestonePlayed(milestone('cuartos'), true)).toBe(false)
  })
})
