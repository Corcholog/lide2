import { describe, expect, it } from 'vitest'
import { forSlot, projectBracketSlots, type SlotProjection } from '@/lib/lide2/projection'
import type { FixtureResultRow, GroupStandingRow } from '@/types/db'

/*
 * The bracket's preview writes team names into the quarter-finals before the
 * organizers do, and the whole thing rests on one promise: a name only appears
 * when no combination of the remaining games can take it away. That is not
 * something you can check by looking at the page - you would have to wait for
 * the group phase to end and see whether it lied - so it is checked here.
 *
 * The awkward case, and the one most of these are about, is the kill difference:
 * it is the table's first tiebreak and a scenario says who wins a game, not by
 * how much. Two teams level on record with a game to play must come out as
 * possibles for both places and not be separated by today's numbers.
 */

/** A `group_standings` row with only what the projection reads filled in. */
function standing(
  id: string,
  wins: number,
  losses: number,
  killDiff: number,
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
    kill_diff: killDiff,
    gold_diff: 0,
    avg_minutes: null,
    last_played_at: null,
    form: null,
    position,
    university_tags: [],
  }
}

/** A matchup. With no winner it is still to be decided; with one it is settled. */
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
  }
}

/** The slot the bracket asks for, or a failure that says which one was missing. */
function slot(projection: SlotProjection[], label: string): SlotProjection {
  const found = forSlot(projection, label)
  if (!found) throw new Error(`there is no projection for ${label}`)
  return found
}

const names = (projection: SlotProjection) =>
  projection.candidates.map((candidate) => candidate.teamName)

describe('a group with nothing left to play', () => {
  // 4-0, 3-1, 2-2, 1-3, 0-4: the whole round robin of a group of five.
  const table = [
    standing('e', 0, 4, -20, 5),
    standing('c', 2, 2, 0, 3),
    standing('a', 4, 0, 20, 1),
    standing('d', 1, 3, -10, 4),
    standing('b', 3, 1, 10, 2),
  ]

  const projection = projectBracketSlots(table, [])

  it('settles both places on the table itself', () => {
    expect(slot(projection, '1º A').locked?.teamName).toBe('Equipo a')
    expect(slot(projection, '2º A').locked?.teamName).toBe('Equipo b')
  })

  it('leaves one scenario, which is the one that happened', () => {
    expect(slot(projection, '1º A').pending).toBe(0)
    expect(slot(projection, '1º A').scenarios).toBe(1)
    expect(names(slot(projection, '1º A'))).toEqual(['Equipo a'])
  })

  it('gives the place to whoever has the better kill difference on level wins', () => {
    const level = projectBracketSlots(
      [standing('a', 3, 1, 5, 2), standing('b', 3, 1, 15, 1), standing('c', 0, 4, -20, 3)],
      [],
    )

    expect(slot(level, '1º A').locked?.teamName).toBe('Equipo b')
    expect(slot(level, '2º A').locked?.teamName).toBe('Equipo a')
  })
})

describe('two teams already through with the order still open', () => {
  /*
   * A group of four with two games left: the two in front have beaten both of
   * the others and only have each other to play. Whoever wins that game
   * finishes first, so neither place is settled - but both teams are through
   * whatever happens, and neither of the other two can reach either place.
   */
  const table = [
    standing('a', 2, 0, 12, 1),
    standing('b', 2, 0, 8, 2),
    standing('c', 0, 2, -8, 3),
    standing('d', 0, 2, -12, 4),
  ]

  const fixture = [matchup('a', 'b'), matchup('c', 'd')]
  const projection = projectBracketSlots(table, fixture)

  it('writes no name into either place', () => {
    expect(slot(projection, '1º A').locked).toBeNull()
    expect(slot(projection, '2º A').locked).toBeNull()
  })

  it('offers the same two as possibles for both places', () => {
    expect(names(slot(projection, '1º A'))).toEqual(['Equipo a', 'Equipo b'])
    expect(names(slot(projection, '2º A'))).toEqual(['Equipo a', 'Equipo b'])
  })

  it('says both are already through', () => {
    expect(slot(projection, '1º A').candidates.map((entry) => entry.qualified)).toEqual([
      true,
      true,
    ])
  })

  it('counts the four ways the group can end', () => {
    expect(slot(projection, '1º A').pending).toBe(2)
    expect(slot(projection, '1º A').scenarios).toBe(4)
    // Each of them is first in the two scenarios where it wins the head to head.
    expect(slot(projection, '1º A').candidates.map((entry) => entry.scenarios)).toEqual([2, 2])
  })
})

describe('a first place nobody can take away', () => {
  /*
   * Same group of four with one game to play. The leader has won its three and
   * is out of reach; the other three end up level on 1-2 if the game goes one
   * way, and since two of them still have a game their kill difference cannot
   * separate them, so second place is open to all three.
   */
  const table = [
    standing('a', 3, 0, 30, 1),
    standing('b', 1, 1, 2, 2),
    standing('c', 1, 2, -10, 3),
    standing('d', 0, 2, -22, 4),
  ]

  const fixture = [matchup('b', 'd')]
  const projection = projectBracketSlots(table, fixture)

  it('writes the leader in', () => {
    expect(slot(projection, '1º A').locked?.teamName).toBe('Equipo a')
    expect(slot(projection, '1º A').locked?.qualified).toBe(true)
    expect(names(slot(projection, '1º A'))).toEqual(['Equipo a'])
  })

  it('leaves second place to the three that can still reach it', () => {
    const second = slot(projection, '2º A')

    expect(second.locked).toBeNull()
    // Whoever gets there in both scenarios goes first; the current table breaks
    // the tie between the other two.
    expect(names(second)).toEqual(['Equipo b', 'Equipo c', 'Equipo d'])
    expect(second.candidates.map((entry) => entry.scenarios)).toEqual([2, 1, 1])
  })

  it('does not call any of the three through, because none of them is', () => {
    expect(slot(projection, '2º A').candidates.every((entry) => entry.qualified)).toBe(false)
  })
})

describe('a group where nothing has been played', () => {
  /*
   * Four teams, the whole round robin to play. Every one of them wins its three
   * in one of the sixteen scenarios, so every one of them is a possible for both
   * places: the projection says so, and it is the bracket that has to decide
   * that a list of the whole group is not worth drawing (see `preview`, in
   * Playoffs).
   */
  const teams = ['a', 'b', 'c', 'd']
  const table = teams.map((id, index) => standing(id, 0, 0, 0, index + 1))
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
  const table = [
    standing('a', 2, 1, 10, 1),
    standing('b', 1, 1, 0, 2),
    standing('c', 1, 2, -10, 3),
  ]

  it('takes a walkover as settled: it has a winner and no game to play', () => {
    const decided = projectBracketSlots(table, [matchup('b', 'c', 'b')])

    expect(decided.every((entry) => entry.pending === 0)).toBe(true)
    expect(slot(decided, '1º A').locked?.teamName).toBe('Equipo a')
  })

  it('takes a matchup with no result yet as open', () => {
    const open = projectBracketSlots(table, [matchup('b', 'c')])

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
      standing('a1', 2, 0, 10, 1, 'Grupo A'),
      standing('a2', 0, 2, -10, 2, 'Grupo A'),
      standing('b1', 2, 0, 10, 1, 'Grupo B'),
      standing('b2', 0, 2, -10, 2, 'Grupo B'),
    ],
    [],
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
    [standing('a', 1, 0, 5, 1), standing('b', 0, 1, -5, 2)],
    [],
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
   * Six teams with the whole round robin to play is 15 games and 32,768 ways it
   * can end, past the ceiling. The format is not one this tournament uses; what
   * matters is that the page goes back to showing the placeholder instead of
   * grinding through it.
   */
  const teams = ['a', 'b', 'c', 'd', 'e', 'f']
  const table = teams.map((id, index) => standing(id, 0, 0, 0, index + 1))
  const fixture = teams.flatMap((a, index) => teams.slice(index + 1).map((b) => matchup(a, b)))

  it('is left unprojected', () => {
    expect(fixture).toHaveLength(15)
    expect(projectBracketSlots(table, fixture)).toEqual([])
  })
})
