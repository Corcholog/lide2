import { describe, expect, it } from 'vitest'
import {
  DRAWN_ROUND,
  drawPending,
  drawProblems,
  sharedUniversity,
  slotLabel,
  type Pairing,
  type Qualified,
} from '@/lib/lide2/draw'

/*
 * The quarter-final draw, which the organizers enter by hand (rule 2.3).
 *
 * Nothing checks it downstream: whatever is recorded becomes the bracket. So
 * the guard is here, and it has to catch the mistakes a person makes filling
 * eight selects -- the same team twice, a side swapped, one left empty.
 */

const QUALIFIED: Qualified[] = [
  { teamId: '1a', teamName: 'Equipo 01', group: 'A', position: 1, universities: ['UNLP'] },
  { teamId: '2a', teamName: 'Equipo 15', group: 'A', position: 2, universities: ['UNER'] },
  { teamId: '1b', teamName: 'Equipo 03', group: 'B', position: 1, universities: ['UNLP'] },
  { teamId: '2b', teamName: 'Equipo 20', group: 'B', position: 2, universities: ['UNPAZ'] },
]

const pair = (a: string | null, b: string | null): Pairing => ({ teamAId: a, teamBId: b })

/** A draw that is fine: every team once, winners left, runners-up right. */
const GOOD: Pairing[] = [pair('1a', '2b'), pair('1b', '2a')]

describe('drawProblems', () => {
  it('accepts a draw that uses each team once, on its own side', () => {
    expect(drawProblems(GOOD, QUALIFIED)).toEqual([])
  })

  /* The structural rule the draw does not touch: a winner meets a runner-up. */
  it('rejects a group winner on the runners-up side', () => {
    const problems = drawProblems([pair('1a', '1b'), pair('2a', '2b')], QUALIFIED)

    expect(problems.join(' ')).toContain('Equipo 03')
    expect(problems.join(' ')).toContain('Equipo 15')
  })

  it('rejects the same team in two pairings', () => {
    const problems = drawProblems([pair('1a', '2b'), pair('1a', '2a')], QUALIFIED)

    expect(problems.some((problem) => problem.includes('aparece en 2 cruces'))).toBe(true)
  })

  it('rejects a pairing with a side left empty', () => {
    expect(drawProblems([pair('1a', null), pair('1b', '2a')], QUALIFIED)).toContain(
      'Al cruce 1 le falta un equipo.',
    )
  })

  it('rejects a draw with the wrong number of pairings', () => {
    expect(drawProblems([pair('1a', '2b')], QUALIFIED)).toEqual(['Son 2 cruces y llegaron 1.'])
  })

  it('rejects a team that did not qualify', () => {
    expect(drawProblems([pair('1a', 'x'), pair('1b', '2a')], QUALIFIED).join(' ')).toContain(
      'no clasificó',
    )
  })

  /*
   * Every problem at once: fixing eight selects one reload at a time would be
   * miserable, so the panel shows the whole list.
   */
  it('reports every problem, not only the first', () => {
    expect(drawProblems([pair('1a', '1b'), pair('1a', '2a')], QUALIFIED).length).toBeGreaterThan(1)
  })
})

describe('sharedUniversity', () => {
  /*
   * Not an error. The rulebook only asks the draw to avoid it "sujeto a
   * disponibilidad", so the panel points it out and still saves.
   */
  it('names the university two teams share', () => {
    expect(sharedUniversity(QUALIFIED[0], QUALIFIED[2])).toBe('UNLP')
    expect(drawProblems([pair('1a', '2b'), pair('1b', '2a')], QUALIFIED)).toEqual([])
  })

  it('is null when they share none, or a side is still empty', () => {
    expect(sharedUniversity(QUALIFIED[0], QUALIFIED[1])).toBeNull()
    expect(sharedUniversity(QUALIFIED[0], undefined)).toBeNull()
  })
})

/*
 * What the bracket says where a team is not known yet.
 *
 * The drawn round is the only one whose stored labels lie: the seed wrote the
 * fixed crossing ("1o A") that rule 2.3 replaced. Read straight from the view
 * the card said "A sortear" beside teams the draw had already put there.
 */
describe('slotLabel', () => {
  it('says the drawn round is to be drawn, while it is', () => {
    expect(slotLabel(DRAWN_ROUND, '1º A', false)).toBe('A sortear')
  })

  it('says nothing beside a team the draw already put there', () => {
    expect(slotLabel(DRAWN_ROUND, '1º A', true)).toBeNull()
  })

  /* The later rounds do follow from the bracket, so their label is true. */
  it('keeps the label the bracket gives the later rounds', () => {
    expect(slotLabel('Semifinales', 'Ganador cuartos 1', false)).toBe('Ganador cuartos 1')
    expect(slotLabel('Gran final', 'Ganador semifinal 2', true)).toBe('Ganador semifinal 2')
  })
})

describe('drawPending', () => {
  it('is pending while any slot is empty', () => {
    expect(drawPending([pair('1a', '2b'), pair(null, null)])).toBe(true)
    expect(drawPending([pair('1a', null)])).toBe(true)
  })

  it('is over once every cross has both teams', () => {
    expect(drawPending(GOOD)).toBe(false)
  })

  /* No quarter-finals loaded is not a draw waiting to be made. */
  it('is not pending when there is no bracket yet', () => {
    expect(drawPending([])).toBe(false)
  })
})
