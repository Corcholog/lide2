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
 * Most of these are about the tiebreak, which is the rulebook's (2.2): level on
 * points, the game between them decides. What makes it projectable is that it
 * is always known - either those two have played already, or the game between
 * them is one of the ones being played out and the scenario says who won it -
 * and what it does not settle, three teams beating each other in a circle, goes
 * to the organizers and has to come out of here unresolved.
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

/**
 * A matchup. `winner` is the id of whoever took it, or null while it is still
 * to be played.
 */
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

/** Whether the bracket would write this slot in: settled AND the team is done. */
const written = (projection: SlotProjection) =>
  projection.locked?.finished ? projection.locked.teamName : null

describe('the head to head separates two teams level on points', () => {
  /*
   * The case that prompted the rule, in the shape it turned up in: two teams
   * that can both finish 3-1, and one of them has already beaten the other.
   * Under the old kill-difference tiebreak neither place could be settled until
   * the last game was uploaded; under the rulebook's, the game between them was
   * played on matchday 1 and the order has been fixed ever since.
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
     * The whole group of five played out, with `a` and `b` both on 3-1 and the
     * game between them won by `a` back on matchday 1. `d` and `e` end level
     * too, at the bottom, and the same rule orders them.
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
     * `a` and `b` have played their four and both finished 3-1; the game still
     * to come is between `c` and `d`, neither of whom can get past 2-2. So the
     * two places are settled with a game still to play, and what settles them
     * is the head to head - on points alone the pair is level.
     *
     * Under a kill-difference tiebreak neither place could be called: `c` and
     * `d` cannot catch them, but their game moves nobody's kill difference
     * either, and the pair would stay unresolved for no reason at all.
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
     * Neither has played the other yet, so who comes first depends on that
     * game - but whoever wins it is first in that scenario, so the pair is
     * separated in every one of them and the two of them are through either
     * way. What is not settled is which place each takes.
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
   * `a` beat `b`, `b` beat `c`, `c` beat `a`, and the three finish level. The
   * mini league gives them one win each, so "enfrentamiento directo" separates
   * nothing and the rulebook hands the case over. The three have to come out as
   * possibles for both places instead of one of them being written in.
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
   * Three level on points without a circle: `a` beat `b` and `c`, `b` beat `c`.
   * Two wins, one and none among themselves, so the order is settled and
   * nothing goes to the organizers.
   *
   * It takes five teams. With four, three level teams have played a complete
   * round robin among themselves and their three mutual wins can only come out
   * one each - a circle, always. The room for a 2-1-0 comes from the games
   * against the rest of the group, and that needs a fifth team: here `a` loses
   * both of its games outside the trio, `b` one, `c` neither.
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
    // `e` is on its own at 3-1; the second place is the top of the mini league.
    expect(slot(projection, '1º A').locked?.teamName).toBe('Equipo e')
    expect(slot(projection, '2º A').locked?.teamName).toBe('Equipo a')
  })
})

describe('a first place nobody can take away', () => {
  /*
   * A group of five with the last matchday to play. `a` has won its four and is
   * out of reach whatever happens, so the slot carries its name while the rest
   * of the group is still moving.
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
     * `b` is second in three of the four scenarios. In the fourth - `e` beating
     * both `b` and `d` - `b`, `c` and `e` all finish 2-2 with a win each over
     * the next: `b` beat `c`, `c` beat `e`, `e` beat `b`. Nothing separates
     * them, so the three share the second and third places and the slot cannot
     * be written in.
     */
    const second = slot(projection, '2º A')

    expect(second.locked).toBeNull()
    expect(names(second)).toEqual(['Equipo b', 'Equipo c', 'Equipo e'])
    expect(second.candidates.map((entry) => entry.scenarios)).toEqual([4, 1, 1])
    // Second in four scenarios out of four is still not "through": in that
    // fourth one it can just as well come third.
    expect(second.candidates[0].qualified).toBe(false)
  })
})

describe('a group where nothing has been played', () => {
  /*
   * Four teams, the whole round robin to play. Every one of them wins its three
   * in one of the sixty-four scenarios, so every one is a possible for both
   * places: the projection says so, and it is the bracket that decides a list
   * of the whole group is worth one line and not four chips (see `Possibles`,
   * in Playoffs).
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
     * `b` did not turn up against `c`, so `c` took the game. The two finish
     * level on 1-1 and the game between them - the one nobody played - is what
     * puts `c` second.
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
   * Six teams with the whole round robin to play is 15 games and 32,768 ways it
   * can end, past the ceiling. The format is not one this tournament uses; what
   * matters is that the page goes back to showing the placeholder instead of
   * grinding through it.
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
   * What the bracket keys off is not the same as what the arithmetic settles,
   * and the two come apart exactly here. `a` has won its three and cannot be
   * caught: the slot is settled. But it still has a game to play, and the
   * bracket waits for that before writing anybody in - naming a quarter-final
   * while its group is still being played is what takes the air out of the last
   * matchday.
   *
   * `b`, level with `a` on points if `a` loses its last one, HAS finished its
   * four and lost the game between them, so second place is both settled and
   * written in.
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
