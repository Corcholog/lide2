import { describe, expect, it } from 'vitest'
import { FINAL_ROUND, championOf, seriesWinner } from '@/lib/lide2/winner'
import type { SeriesResultRow } from '@/types/db'

/*
 * The champion is what the home page's hero shows once the calendar runs out,
 * so it can only be seen for real the day after the final. That is late to find
 * out that the name is taken from the wrong column, hence these.
 */

/** A `series_results` row, with everything the winner does not read left empty. */
function series(fields: Partial<SeriesResultRow>): SeriesResultRow {
  return {
    id: 'serie',
    stage_id: null,
    tournament_id: null,
    stage_name: null,
    stage_order: null,
    round: FINAL_ROUND,
    order_index: 0,
    best_of: 5,
    status: 'scheduled',
    scheduled_at: null,
    team_a_id: null,
    team_a_name: null,
    team_a_logo: null,
    slot_a_label: null,
    team_b_id: null,
    team_b_name: null,
    team_b_logo: null,
    slot_b_label: null,
    winner_team_id: null,
    next_series_id: null,
    next_slot: null,
    games_played: 0,
    wins_a: 0,
    wins_b: 0,
    ...fields,
  }
}

const FINAL = {
  team_a_id: 'a',
  team_a_name: 'UNLP Naranja',
  team_b_id: 'b',
  team_b_name: 'UAI Azul',
}

describe('the winner of a series', () => {
  it('reads the name off whichever side won', () => {
    expect(seriesWinner(series({ ...FINAL, winner_team_id: 'a' }))).toBe('UNLP Naranja')
    expect(seriesWinner(series({ ...FINAL, winner_team_id: 'b' }))).toBe('UAI Azul')
  })

  it('gives nothing while the series is not decided', () => {
    expect(seriesWinner(series(FINAL))).toBeUndefined()
    expect(seriesWinner(undefined)).toBeUndefined()
  })

  it('gives nothing when the winning side has no name yet', () => {
    expect(seriesWinner(series({ team_a_id: 'a', winner_team_id: 'a' }))).toBeUndefined()
  })
})

describe('the tournament champion', () => {
  it('comes from the grand final and not from a round already played', () => {
    const bracket = [
      series({
        id: 'semi',
        round: 'Semifinales',
        team_a_id: 'a',
        team_a_name: 'UNLP Naranja',
        winner_team_id: 'a',
      }),
      series({ id: 'final', ...FINAL, winner_team_id: 'b' }),
    ]

    expect(championOf(bracket)).toBe('UAI Azul')
  })

  it('gives nothing with the final unplayed, and nothing with no bracket', () => {
    expect(championOf([series({ id: 'final', ...FINAL })])).toBeUndefined()
    expect(championOf([])).toBeUndefined()
  })
})
