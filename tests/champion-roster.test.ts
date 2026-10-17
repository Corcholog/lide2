import { describe, expect, it } from 'vitest'
import { championRoster } from '@/lib/lide2/champion-roster'
import type { PlayerPhaseTotalsRow } from '@/types/db'

/* Only the fields the roster reads. */
function player(fields: Partial<PlayerPhaseTotalsRow>): PlayerPhaseTotalsRow {
  return {
    player_id: 'p',
    player_name: 'Jugador',
    position: 'TOP',
    games: 5,
    kda: 3,
    avg_kills: 3,
    avg_deaths: 2,
    avg_assists: 6,
    dpm: 500.4,
    gpm: 400.6,
    ...fields,
  } as PlayerPhaseTotalsRow
}

describe('the champion roster', () => {
  it('lists the five roles in lane order whatever order the rows come in', () => {
    const cards = championRoster([
      player({ player_id: 's', player_name: 'S', position: 'SUPPORT' }),
      player({ player_id: 'b', player_name: 'B', position: 'BOTTOM' }),
      player({ player_id: 't', player_name: 'T', position: 'TOP' }),
      player({ player_id: 'm', player_name: 'M', position: 'MIDDLE' }),
      player({ player_id: 'j', player_name: 'J', position: 'JUNGLE' }),
    ])

    expect(cards.map((card) => card.role)).toEqual(['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'SUPPORT'])
  })

  it('takes the player who played the role most', () => {
    const cards = championRoster([
      player({ player_id: 'sub', player_name: 'Suplente', games: 1 }),
      player({ player_id: 'main', player_name: 'Titular', games: 6 }),
    ])

    expect(cards).toHaveLength(1)
    expect(cards[0].name).toBe('Titular')
  })

  it('leaves a role nobody played out, and ignores rows with no player', () => {
    const cards = championRoster([
      player({ position: 'MIDDLE', player_id: 'm' }),
      player({ position: 'JUNGLE', player_id: null }),
      player({ position: null, player_id: 'x' }),
    ])

    expect(cards.map((card) => card.role)).toEqual(['MIDDLE'])
  })

  it('rounds the per-minute rates and writes the KDA', () => {
    const [card] = championRoster([player({ kda: 4.25 })])

    expect(card).toMatchObject({ dpm: 500, gpm: 401, kda: '4.3', line: '3/2/6' })
  })

  it('gives nothing for no players', () => {
    expect(championRoster([])).toEqual([])
  })
})
