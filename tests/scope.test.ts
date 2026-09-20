import { describe, expect, it } from 'vitest'
import { scopeFilter, matchFilter } from '@/lib/stats/filters'
import {
  hasGroups,
  MATCHDAYS,
  parseScope,
  ROUNDS,
  scopeLabel,
  scopeValue,
} from '@/lib/stats/scope'
import { FINAL_ROUND } from '@/lib/lide2/winner'

/*
 * `?fecha=`, which since 0032 names four kinds of scope rather than just a
 * matchday. The value travels in links people have shared, so the old ones
 * have to keep working and anything unreadable has to still render a page.
 */

const T = 'torneo-1'

describe('parseScope', () => {
  it('with no parameter it is the whole tournament', () => {
    expect(parseScope(undefined)).toEqual({ kind: 'torneo' })
    expect(parseScope('')).toEqual({ kind: 'torneo' })
  })

  /* Links shared while only the group phase existed still mean what they meant. */
  it('still reads a bare matchday number', () => {
    expect(parseScope('2')).toEqual({
      kind: 'fecha',
      phase: 'grupos',
      matchday: 2,
    })
  })

  it('reads a whole phase', () => {
    expect(parseScope('grupos')).toEqual({ kind: 'fase', phase: 'grupos' })
    expect(parseScope('playoffs')).toEqual({ kind: 'fase', phase: 'playoffs' })
  })

  it('reads a playoff round as the label the database stores', () => {
    expect(parseScope('cuartos')).toEqual({
      kind: 'ronda',
      phase: 'playoffs',
      round: 'Cuartos de final',
    })
  })

  it('ignores case, as the group filter does', () => {
    expect(parseScope('PLAYOFFS')).toEqual({ kind: 'fase', phase: 'playoffs' })
  })

  /* A stale or hand-edited link shows the tournament rather than an error. */
  it('falls back to the whole tournament on anything unreadable', () => {
    expect(parseScope('9')).toEqual({ kind: 'torneo' })
    expect(parseScope('semifinales')).toEqual({ kind: 'torneo' })
  })
})

describe('scopeValue', () => {
  it('the whole tournament needs no parameter, being the default', () => {
    expect(scopeValue({ kind: 'torneo' })).toBeNull()
  })

  it('round-trips every scope the nav can produce', () => {
    const values = [null, 'grupos', 'playoffs', ...MATCHDAYS.map((m) => String(m.matchday)),
      ...ROUNDS.map((r) => r.id)]

    for (const value of values) {
      expect(scopeValue(parseScope(value ?? undefined))).toBe(value)
    }
  })
})

/*
 * `ROUNDS` labels are matched against `round_label`, which comes from the
 * series' `round` written by scripts/seed-lide2.ts. The calendar is the single
 * source for both, and this is what would catch them drifting apart: a label
 * that no longer matches would quietly filter to zero rows.
 */
describe('ROUNDS', () => {
  it('labels the rounds exactly as the seed writes them', () => {
    expect(ROUNDS.map((round) => round.label)).toEqual([
      'Cuartos de final',
      'Semifinales',
      FINAL_ROUND,
    ])
  })

  it('has an id for the URL that is not the label', () => {
    expect(ROUNDS.map((round) => round.id)).toEqual(['cuartos', 'semis', 'final'])
  })
})

describe('hasGroups', () => {
  /* A playoff series belongs to no group, so there is nothing to split. */
  it('is only true inside the group phase', () => {
    expect(hasGroups(parseScope('grupos'))).toBe(true)
    expect(hasGroups(parseScope('3'))).toBe(true)
    expect(hasGroups(parseScope('playoffs'))).toBe(false)
    expect(hasGroups(parseScope('cuartos'))).toBe(false)
    expect(hasGroups(parseScope(undefined))).toBe(false)
  })
})

describe('scopeFilter', () => {
  /* The row 0032 added: the only one with no phase at all. */
  it('asks for the tournament row by `all_phases` alone', () => {
    expect(scopeFilter(parseScope(undefined), T)).toEqual({
      tournament_id: T,
      all_phases: true,
    })
  })

  it('asks for a whole phase by `is_total` with the phase pinned', () => {
    expect(scopeFilter(parseScope('playoffs'), T)).toEqual({
      tournament_id: T,
      phase: 'playoffs',
      is_total: true,
    })
  })

  it('asks for a playoff round by its label, which has no matchday', () => {
    const filter = scopeFilter(parseScope('cuartos'), T)

    expect(filter).toEqual({
      tournament_id: T,
      phase: 'playoffs',
      is_total: false,
      round_label: 'Cuartos de final',
    })
    expect(filter).not.toHaveProperty('matchday')
  })

  /*
   * Pinning the phase is what keeps the narrower scopes away from the
   * tournament row, whose phase is NULL and so matches no equality.
   */
  it('pins the phase on everything except the tournament', () => {
    for (const value of ['grupos', 'playoffs', '1', 'cuartos']) {
      expect(scopeFilter(parseScope(value), T)).toHaveProperty('phase')
    }
  })
})

describe('matchFilter', () => {
  /* `match_records` has a row per match and no accumulated rows to tell apart. */
  it('sends no flags: the tournament is simply every match', () => {
    expect(matchFilter(parseScope(undefined), T)).toEqual({ tournament_id: T })
  })

  it('narrows a round by its label, as the accumulated views do', () => {
    expect(matchFilter(parseScope('final'), T)).toEqual({
      tournament_id: T,
      phase: 'playoffs',
      round_label: FINAL_ROUND,
    })
  })
})

describe('scopeLabel', () => {
  it('names each scope the way the page does', () => {
    expect(scopeLabel(parseScope(undefined))).toBe('Todo el torneo')
    expect(scopeLabel(parseScope('grupos'))).toBe('Fase de grupos')
    expect(scopeLabel(parseScope('playoffs'))).toBe('Playoffs')
    expect(scopeLabel(parseScope('2'))).toBe('Fecha 2')
    expect(scopeLabel(parseScope('semis'))).toBe('Semifinales')
  })
})
