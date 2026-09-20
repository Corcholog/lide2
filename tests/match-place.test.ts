import { describe, expect, it } from 'vitest'
import { matchPlace } from '@/lib/matches'

/*
 * The line under a match's date, on /partidas and on its own page.
 *
 * The two phases key it differently: a group match has a group and a matchday,
 * a playoff one has a round and a game of the series, and neither has the
 * other's columns. Read as one fallback chain it used to come out right for
 * the group phase by luck and thin for the playoffs.
 */

const place = (over: Partial<Parameters<typeof matchPlace>[0]>) =>
  matchPlace({
    phase: null,
    group_label: null,
    matchday: null,
    round_label: null,
    stage_label: null,
    game_number: null,
    ...over,
  })

describe('matchPlace', () => {
  it('names the group and the matchday in the group phase', () => {
    expect(
      place({ phase: 'grupos', group_label: 'Grupo A', matchday: 1, round_label: 'Fecha 1' }),
    ).toEqual(['Grupo A', 'Fecha 1'])
  })

  /* The playoff equivalent of "Grupo A · Fecha 1": the round, then the game. */
  it('names the round and which game of the series it was', () => {
    expect(place({ phase: 'playoffs', round_label: 'Cuartos de final', game_number: 2 })).toEqual([
      'Cuartos de final',
      'Partida 2',
    ])
  })

  /*
   * Games played before 0034 carry no number. The round alone still says it is
   * a playoff match, which is the part that matters.
   */
  it('gives the round alone when the game was never numbered', () => {
    expect(place({ phase: 'playoffs', round_label: 'Gran final' })).toEqual(['Gran final'])
  })

  /* A playoff match has no group and no matchday; neither may leak in. */
  it('never mixes the two phases', () => {
    const playoff = place({
      phase: 'playoffs',
      round_label: 'Semifinales',
      game_number: 1,
      group_label: 'Grupo A',
      matchday: 3,
    })

    expect(playoff).toEqual(['Semifinales', 'Partida 1'])
  })

  /*
   * An upload nobody has assigned yet: whatever the .rofl called it is all
   * there is to say, and saying nothing would leave the row with just a patch.
   */
  it('falls back to the labels the file carried', () => {
    expect(place({ stage_label: 'Grupo D', round_label: 'Fecha 2' })).toEqual([
      'Grupo D',
      'Fecha 2',
    ])
  })

  it('is empty when there is nothing to say, so the caller can say the patch', () => {
    expect(place({})).toEqual([])
  })
})
