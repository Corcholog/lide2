import { describe, expect, it } from 'vitest'
import { forSlot, projectBracketSlots, type SlotProjection } from '@/lib/lide2/projection'
import type { FixtureResultRow, GroupStandingRow } from '@/types/db'

/*
 * The bracket preview writes team names into quarter-final slots before the
 * organizers do, so a name must only appear when no remaining result can change
 * it. These tests check that promise.
 *
 * Most cover the rulebook tiebreak (2.2): level on points, the game between the
 * teams decides. A tie it cannot break (three teams beating each other in a
 * cycle) is left to the organizers and must stay unresolved.
 */

/** A `group_standings` row with only what the projection reads filled in. */
function standing(
  id: string,
  wins: number,
  losses: number,
  position: number,
  group = 'Grupo A',
): GroupStandingRow {
  return {
    tournament_id: 'torneo',
    group_label: group,
    team_id: id,
    team_name: `Equipo ${id}`,
    team_tag: null,
    team_logo: null,
    university_id: null,
    university_name: null,
    university_tag: null,
    university_logo: null,
    games: wins + losses,
    wins,
    losses,
    kills: 0,
    kills_against: 0,
    kill_diff: 0,
    gold_diff: 0,
    avg_minutes: null,
    last_played_at: null,
    form: null,
    position,
    university_tags: [],
  }
}

/** A matchup; `winner` is the winning team's id, or null while unplayed. */
function matchup(a: string, b: string, winner: string | null = null): FixtureResultRow {
  return {
    id: `${a}-${b}`,
    tournament_id: 'torneo',
    stage_id: null,
    group_label: 'Grupo A',
    matchday: 1,
    slot: 1,
    kickoff: '2026-09-05T17:00:00.000Z',
    match_id: null,
    team_a_id: a,
    team_a_name: `Equipo ${a}`,
    team_a_tag: null,
    team_a_logo: null,
    team_a_kills: null,
    team_a_win: null,
    team_b_id: b,
    team_b_name: `Equipo ${b}`,
    team_b_tag: null,
    team_b_logo: null,
    team_b_kills: null,
    team_b_win: null,
    played_at: null,
    game_length_ms: null,
    ended_in_surrender: null,
    winner_team_id: winner,
    status: winner ? 'jugado' : 'pendiente',
    team_a_universities: null,
    team_b_universities: null,
    walkover_team_id: null,
    ruling: null,
  }
}

/** The projection for a slot label, failing with the label when it is missing. */
function slot(projection: SlotProjection[], label: string): SlotProjection {
  const found = forSlot(projection, label)
  if (!found) throw new Error(`there is no projection for ${label}`)
  return found
}

const names = (projection: SlotProjection) =>
  projection.candidates.map((candidate) => candidate.teamName)

/** Whether the bracket would show this slot's team: settled and the team has finished. */
const written = (projection: SlotProjection) =>
  projection.locked?.finished ? projection.locked.teamName : null

describe('the head to head separates two teams level on points', () => {
  /*
   * Two teams can both finish 3-1, and one already beat the other on matchday 1,
   * so the head to head settles their order.
   */
  const table = [
    standing('a', 3, 0, 1),
    standing('b', 2, 1, 2),
    standing('c', 1, 2, 3),
    standing('d', 0, 3, 4),
  ]

  const fixture = [
    matchup('a', 'b', 'a'), // the head to head, already played
    matchup('a', 'c', 'a'),
    matchup('a', 'd', 'a'),
    matchup('b', 'c', 'b'),
    matchup('b', 'd', 'b'),
    matchup('c', 'd', 'c'),
  ]

  it('settles the whole table with nothing left to play', () => {
    const projection = projectBracketSlots(table, fixture)

    expect(slot(projection, '1º A').locked?.teamName).toBe('Equipo a')
    expect(slot(projection, '2º A').locked?.teamName).toBe('Equipo b')
  })

  it('is the case that was reported: two at 3-1, and one beat the other', () => {
    /*
     * The full group played out: `a` and `b` both 3-1, `a` won their game; `d`
     * and `e` are also level at the bottom and ordered the same way.
     */
    const five = [
      standing('a', 3, 1, 1),
      standing('b', 3, 1, 2),
      standing('c', 2, 2, 3),
      standing('d', 1, 3, 4),
      standing('e', 1, 3, 5),
    ]
    const games = [
      matchup('a', 'b', 'a'),
      matchup('a', 'c', 'a'),
      matchup('a', 'd', 'a'),
      matchup('a', 'e', 'e'),
      matchup('b', 'c', 'b'),
      matchup('b', 'd', 'b'),
      matchup('b', 'e', 'b'),
      matchup('c', 'd', 'c'),
      matchup('c', 'e', 'c'),
      matchup('d', 'e', 'd'),
    ]

    const projection = projectBracketSlots(five, games)

    expect(slot(projection, '1º A').locked?.teamName).toBe('Equipo a')
    expect(slot(projection, '2º A').locked?.teamName).toBe('Equipo b')
  })

  it('settles a place before the group ends, which kill difference never could', () => {
    /*
     * `a` and `b` have played all four games and both finished 3-1; the remaining
     * game is between `c` and `d`, who cannot pass 2-2. Both places are settled
     * with a game left, decided by the head to head.
     */
    const open = [
      standing('a', 3, 1, 1),
      standing('b', 3, 1, 2),
      standing('c', 1, 2, 3),
      standing('d', 1, 2, 4),
      standing('e', 1, 3, 5),
    ]
    const games = [
      matchup('a', 'b', 'a'),
      matchup('a', 'c', 'a'),
      matchup('a', 'd', 'a'),
      matchup('a', 'e', 'e'),
      matchup('b', 'c', 'b'),
      matchup('b', 'd', 'b'),
      matchup('b', 'e', 'b'),
      matchup('c', 'e', 'c'),
      matchup('d', 'e', 'd'),
      matchup('c', 'd'), // the only one left
    ]

    const projection = projectBracketSlots(open, games)

    expect(slot(projection, '1º A').pending).toBe(1)
    expect(slot(projection, '1º A').scenarios).toBe(2)
    expect(slot(projection, '1º A').locked?.teamName).toBe('Equipo a')
    expect(slot(projection, '2º A').locked?.teamName).toBe('Equipo b')
    expect(slot(projection, '1º A').locked?.qualified).toBe(true)
  })

  it('settles them even when the game between them is one of the ones left', () => {
    /*
     * They have not played each other yet: whoever wins that game is first in
     * that scenario, so both are through either way, but which place each takes
     * is not settled.
     */
    const table2 = [standing('a', 2, 0, 1), standing('b', 2, 0, 2), standing('c', 0, 2, 3), standing('d', 0, 2, 4)]
    const games = [
      matchup('a', 'c', 'a'),
      matchup('a', 'd', 'a'),
      matchup('b', 'c', 'b'),
      matchup('b', 'd', 'b'),
      matchup('a', 'b'), // to play: it decides the order
      matchup('c', 'd'), // to play: it decides nothing up top
    ]

    const projection = projectBracketSlots(table2, games)

    expect(slot(projection, '1º A').locked).toBeNull()
    expect(names(slot(projection, '1º A'))).toEqual(['Equipo a', 'Equipo b'])
    expect(slot(projection, '1º A').candidates.every((entry) => entry.qualified)).toBe(true)
    // Each is first in the two scenarios where it wins the head to head.
    expect(slot(projection, '1º A').candidates.map((entry) => entry.scenarios)).toEqual([2, 2])
  })
})

describe('three teams in a circle are left to the organizers', () => {
  /*
   * `a` beat `b`, `b` beat `c`, `c` beat `a`, and all three finish level. The
   * mini league gives each one win, so nothing separates them and all three
   * remain candidates for both places.
   */
  const table = [standing('a', 2, 1, 1), standing('b', 2, 1, 2), standing('c', 2, 1, 3), standing('d', 0, 3, 4)]

  const fixture = [
    matchup('a', 'b', 'a'),
    matchup('b', 'c', 'b'),
    matchup('c', 'a', 'c'),
    matchup('a', 'd', 'a'),
    matchup('b', 'd', 'b'),
    matchup('c', 'd', 'c'),
  ]

  const projection = projectBracketSlots(table, fixture)

  it('writes nobody in, with the group finished', () => {
    expect(slot(projection, '1º A').pending).toBe(0)
    expect(slot(projection, '1º A').locked).toBeNull()
    expect(slot(projection, '2º A').locked).toBeNull()
  })

  it('leaves the three as possibles for both places', () => {
    expect(names(slot(projection, '1º A'))).toEqual(['Equipo a', 'Equipo b', 'Equipo c'])
    expect(names(slot(projection, '2º A'))).toEqual(['Equipo a', 'Equipo b', 'Equipo c'])
  })

  it('does not call any of them through: one of the three misses out', () => {
    expect(slot(projection, '1º A').candidates.some((entry) => entry.qualified)).toBe(false)
  })
})

describe('three teams level that the mini league does separate', () => {
  /*
   * Three level teams without a cycle: `a` beat `b` and `c`, `b` beat `c`. Two,
   * one and zero wins among themselves, so the order is settled.
   *
   * This needs five teams: with four, three level teams have played each other
   * and their mutual wins can only split one each (a cycle). The 2-1-0 split
   * comes from the games against the other two teams.
   */
  const table = [
    standing('e', 3, 1, 1),
    standing('a', 2, 2, 2),
    standing('b', 2, 2, 3),
    standing('c', 2, 2, 4),
    standing('d', 1, 3, 5),
  ]

  const fixture = [
    matchup('a', 'b', 'a'),
    matchup('a', 'c', 'a'),
    matchup('b', 'c', 'b'),
    matchup('a', 'd', 'd'),
    matchup('a', 'e', 'e'),
    matchup('b', 'd', 'b'),
    matchup('b', 'e', 'e'),
    matchup('c', 'd', 'c'),
    matchup('c', 'e', 'c'),
    matchup('d', 'e', 'e'),
  ]

  const projection = projectBracketSlots(table, fixture)

  it('orders them by the games among themselves', () => {
    // `e` is alone at 3-1; second place is the top of the mini league.
    expect(slot(projection, '1º A').locked?.teamName).toBe('Equipo e')
    expect(slot(projection, '2º A').locked?.teamName).toBe('Equipo a')
  })
})

describe('a first place nobody can take away', () => {
  /*
   * A group of five before its last matchday. `a` has won all four and cannot be
   * caught, so its slot is settled while the rest of the group is still open.
   */
  const table = [
    standing('a', 4, 0, 1),
    standing('b', 2, 1, 2),
    standing('c', 2, 2, 3),
    standing('e', 0, 2, 4),
    standing('d', 0, 3, 5),
  ]

  const fixture = [
    matchup('a', 'b', 'a'),
    matchup('a', 'c', 'a'),
    matchup('a', 'd', 'a'),
    matchup('a', 'e', 'a'),
    matchup('b', 'c', 'b'),
    matchup('b', 'd', 'b'),
    matchup('c', 'd', 'c'),
    matchup('c', 'e', 'c'),
    matchup('b', 'e'), // to play
    matchup('d', 'e'), // to play
  ]

  const projection = projectBracketSlots(table, fixture)

  it('writes the leader in', () => {
    expect(slot(projection, '1º A').locked?.teamName).toBe('Equipo a')
    expect(slot(projection, '1º A').locked?.qualified).toBe(true)
    expect(names(slot(projection, '1º A'))).toEqual(['Equipo a'])
  })

  it('counts the four ways the group can still end', () => {
    expect(slot(projection, '1º A').pending).toBe(2)
    expect(slot(projection, '1º A').scenarios).toBe(4)
    expect(slot(projection, '1º A').teams).toBe(5)
  })

  it('leaves second place open, because one branch ends in a circle', () => {
    /*
     * `b` is second in three of four scenarios. In the fourth (`e` beats `b` and
     * `d`), `b`, `c` and `e` finish 2-2 in a cycle (`b` beat `c`, `c` beat `e`,
     * `e` beat `b`), so the slot cannot be settled.
     */
    const second = slot(projection, '2º A')

    expect(second.locked).toBeNull()
    expect(names(second)).toEqual(['Equipo b', 'Equipo c', 'Equipo e'])
    expect(second.candidates.map((entry) => entry.scenarios)).toEqual([4, 1, 1])
    // In that fourth scenario it can also finish third, so it is not "through".
    expect(second.candidates[0].qualified).toBe(false)
  })
})

describe('a group where nothing has been played', () => {
  /*
   * Four teams with the whole round robin to play: each one wins all its games
   * in some scenario, so every team is a candidate for both places.
   */
  const teams = ['a', 'b', 'c', 'd']
  const table = teams.map((id, index) => standing(id, 0, 0, index + 1))
  const fixture = teams.flatMap((a, index) => teams.slice(index + 1).map((b) => matchup(a, b)))

  const projection = projectBracketSlots(table, fixture)

  it('settles nothing and rules nobody out', () => {
    expect(slot(projection, '1º A').locked).toBeNull()
    expect(names(slot(projection, '1º A'))).toEqual(teams.map((id) => `Equipo ${id}`))
    expect(slot(projection, '2º A').candidates).toHaveLength(4)
  })

  it('says how many teams the group has, so the list can be measured', () => {
    expect(slot(projection, '1º A').teams).toBe(4)
    expect(slot(projection, '1º A').pending).toBe(6)
    expect(slot(projection, '1º A').scenarios).toBe(64)
  })

  it('does not call anybody through', () => {
    expect(slot(projection, '1º A').candidates.some((entry) => entry.qualified)).toBe(false)
  })
})

describe('what counts as a game still to be decided', () => {
  const table = [standing('a', 2, 0, 1), standing('b', 1, 1, 2), standing('c', 0, 2, 3)]

  it('takes a walkover as settled, and it counts for the head to head', () => {
    /*
     * `b` did not turn up against `c`. They finish level at 1-1, and that awarded
     * game puts `c` second.
     */
    const decided = projectBracketSlots(
      [standing('a', 2, 0, 1), standing('b', 1, 1, 2), standing('c', 1, 1, 3)],
      [matchup('a', 'b', 'a'), matchup('a', 'c', 'a'), matchup('b', 'c', 'c')],
    )

    expect(decided.every((entry) => entry.pending === 0)).toBe(true)
    expect(slot(decided, '1º A').locked?.teamName).toBe('Equipo a')
    expect(slot(decided, '2º A').locked?.teamName).toBe('Equipo c')
  })

  it('takes a matchup with no result yet as open', () => {
    const open = projectBracketSlots(table, [matchup('a', 'b', 'a'), matchup('b', 'c')])

    expect(slot(open, '1º A').pending).toBe(1)
  })

  it('ignores a matchup whose teams are not in the table', () => {
    const foreign = projectBracketSlots(table, [matchup('x', 'y')])

    expect(slot(foreign, '1º A').pending).toBe(0)
  })
})

describe('the groups are kept apart', () => {
  const projection = projectBracketSlots(
    [
      standing('a1', 1, 0, 1, 'Grupo A'),
      standing('a2', 0, 1, 2, 'Grupo A'),
      standing('b1', 1, 0, 1, 'Grupo B'),
      standing('b2', 0, 1, 2, 'Grupo B'),
    ],
    [matchup('a1', 'a2', 'a1'), matchup('b1', 'b2', 'b1')],
  )

  it('projects each group off its own table', () => {
    expect(slot(projection, '1º A').locked?.teamName).toBe('Equipo a1')
    expect(slot(projection, '1º B').locked?.teamName).toBe('Equipo b1')
  })

  it('has nothing to say about a group that does not exist', () => {
    expect(forSlot(projection, '1º C')).toBeUndefined()
  })
})

describe('reading a slot label', () => {
  const projection = projectBracketSlots(
    [standing('a', 1, 0, 1), standing('b', 0, 1, 2)],
    [matchup('a', 'b', 'a')],
  )

  it('accepts the ways a place gets written', () => {
    for (const label of ['1º A', '1o A', '1ro A', '1° A', ' 1 A ', '1A']) {
      expect(forSlot(projection, label)?.locked?.teamName).toBe('Equipo a')
    }
  })

  it('turns down a slot that is not a place in a group', () => {
    // The semis and the final come from other series, not from a table.
    expect(forSlot(projection, 'Ganador cuartos 1')).toBeUndefined()
    expect(forSlot(projection, 'Ganador semifinal 2')).toBeUndefined()
    expect(forSlot(projection, null)).toBeUndefined()
  })
})

describe('a group that branches too far', () => {
  /*
   * Six teams with the whole round robin to play: 15 games, 32,768 scenarios,
   * above the limit. The group is not projected and slots keep the placeholder.
   */
  const teams = ['a', 'b', 'c', 'd', 'e', 'f']
  const table = teams.map((id, index) => standing(id, 0, 0, index + 1))
  const fixture = teams.flatMap((a, index) => teams.slice(index + 1).map((b) => matchup(a, b)))

  it('is left unprojected', () => {
    expect(fixture).toHaveLength(15)
    expect(projectBracketSlots(table, fixture)).toEqual([])
  })
})

describe('a team that is through but has not finished playing', () => {
  /*
   * Settled is not the same as shown. `a` has won three and cannot be caught, so
   * its slot is settled, but it still has a game left and the bracket waits for
   * it. `b` has finished its four games and lost to `a`, so second place is
   * settled and shown.
   */
  const table = [
    standing('a', 3, 0, 1),
    standing('b', 3, 1, 2),
    standing('c', 1, 2, 3),
    standing('d', 1, 2, 4),
    standing('e', 0, 3, 5),
  ]

  const fixture = [
    matchup('a', 'b', 'a'),
    matchup('a', 'c', 'a'),
    matchup('a', 'd', 'a'),
    matchup('b', 'c', 'b'),
    matchup('b', 'd', 'b'),
    matchup('b', 'e', 'e'),
    matchup('c', 'e', 'c'),
    matchup('d', 'e', 'd'),
    matchup('a', 'e'), // `a` still has this one
    matchup('c', 'd'), // and these two are still moving
  ]

  const projection = projectBracketSlots(table, fixture)

  it('settles first place all the same', () => {
    expect(slot(projection, '1º A').locked?.teamName).toBe('Equipo a')
  })

  it('does not write it in while that team still has a game', () => {
    expect(slot(projection, '1º A').locked?.finished).toBe(false)
    expect(written(slot(projection, '1º A'))).toBeNull()
  })

  it('writes in the one that is settled and has finished', () => {
    expect(slot(projection, '2º A').locked?.teamName).toBe('Equipo b')
    expect(slot(projection, '2º A').locked?.finished).toBe(true)
    expect(written(slot(projection, '2º A'))).toBe('Equipo b')
  })
})
