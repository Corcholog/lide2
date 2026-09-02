import { describe, expect, it } from 'vitest'
import { GROUP_OPTIONS, metaFilter, parseGroup } from '../src/lib/stats/tables'
import { parseTeamFilter } from '../src/lib/stats/scope'
import { withQuery } from '../src/lib/url'
import { GROUPS } from '../src/lib/lide2/tournament'
import type { StatScope } from '../src/lib/stats/types'

const scope = (matchday: number | null): StatScope => ({
  tournamentId: 'torneo-1',
  phase: 'grupos',
  matchday,
})

describe('GROUP_OPTIONS', () => {
  it('comes from the tournament and not from a separate list', () => {
    expect(GROUP_OPTIONS).toHaveLength(GROUPS.length)
    expect(GROUP_OPTIONS.map((g) => g.id)).toEqual([...GROUPS])
  })

  it('the label is the same text teams.group_label stores', () => {
    expect(GROUP_OPTIONS[0].label).toBe('Grupo A')
  })
})

describe('parseGroup', () => {
  it('with no parameter it is every group', () => {
    expect(parseGroup(undefined)).toBeNull()
    expect(parseGroup('')).toBeNull()
  })

  it('turns the letter into the label the database uses', () => {
    expect(parseGroup('B')).toBe('Grupo B')
  })

  it('accepts the letter in lower case', () => {
    expect(parseGroup('c')).toBe('Grupo C')
  })

  it('a group that does not exist means all of them', () => {
    expect(parseGroup('Z')).toBeNull()
  })

  it('with a repeated parameter it keeps the first one', () => {
    expect(parseGroup(['D', 'A'])).toBe('Grupo D')
  })
})

describe('metaFilter', () => {
  it('accumulated: every group and the whole phase', () => {
    expect(metaFilter(scope(null), null)).toEqual({
      tournament_id: 'torneo-1',
      phase: 'grupos',
      all_groups: true,
      all_matchdays: true,
    })
  })

  it('by matchday: every group, one matchday', () => {
    expect(metaFilter(scope(2), null)).toEqual({
      tournament_id: 'torneo-1',
      phase: 'grupos',
      all_groups: true,
      all_matchdays: false,
      matchday: 2,
    })
  })

  it('by group: one group, the whole phase', () => {
    expect(metaFilter(scope(null), 'Grupo B')).toEqual({
      tournament_id: 'torneo-1',
      phase: 'grupos',
      all_groups: false,
      group_label: 'Grupo B',
      all_matchdays: true,
    })
  })

  it('group plus matchday: the intersection of the two', () => {
    expect(metaFilter(scope(3), 'Grupo A')).toEqual({
      tournament_id: 'torneo-1',
      phase: 'grupos',
      all_groups: false,
      group_label: 'Grupo A',
      all_matchdays: false,
      matchday: 3,
    })
  })

  it('never sends group_label or matchday when the scope is the total', () => {
    // Sending them as null would also drag in the matches with no group
    // resolved, which is exactly what the two flags avoid.
    const filter = metaFilter(scope(null), null)
    expect(filter).not.toHaveProperty('group_label')
    expect(filter).not.toHaveProperty('matchday')
  })
})

describe('parseTeamFilter', () => {
  const teams = ['aaa', 'bbb']

  it('with no parameter it does not filter', () => {
    expect(parseTeamFilter(undefined, teams)).toBeNull()
  })

  it('accepts a team from the tournament', () => {
    expect(parseTeamFilter('bbb', teams)).toBe('bbb')
  })

  it('ignores an id that is not from this tournament', () => {
    expect(parseTeamFilter('zzz', teams)).toBeNull()
  })

  it('with a repeated parameter it keeps the first one', () => {
    expect(parseTeamFilter(['aaa', 'bbb'], teams)).toBe('aaa')
  })
})

describe('withQuery', () => {
  it('with no parameters it returns the bare path', () => {
    expect(withQuery('/partidas', {})).toBe('/partidas')
  })

  it('keeps the filters that were already set', () => {
    expect(withQuery('/partidas', { fecha: 2, equipo: 'aaa' })).toBe('/partidas?fecha=2&equipo=aaa')
  })

  it('drops the empty ones instead of leaving a valueless parameter', () => {
    expect(withQuery('/partidas', { fecha: null, equipo: undefined, orden: '' })).toBe('/partidas')
  })
})
