import { describe, expect, it } from 'vitest'
import { championRoles, formatRoles } from '@/lib/format'
import { byRole, parseRole } from '@/lib/stats/tables'

/*
 * The two halves of showing a champion's roles that do not live in SQL: the
 * order they are read in, and the filter that decides which champions a role
 * shows.
 *
 * The views hand the roles over as an unordered set on purpose, so the order is
 * this side's job and is the thing worth pinning down: the main role leads -
 * it is the answer to "what is this champion" - and the rest follow by lane,
 * which is how a team is read everywhere else on the site.
 */

/** The role option the `?rol=` chips produce, by the label people read. */
function role(label: string) {
  const found = parseRole(label.toLowerCase())
  if (!found) throw new Error(`there is no role called ${label}`)
  return found
}

describe('the order the roles are read in', () => {
  it('puts the main one first, whichever it is', () => {
    expect(championRoles(['SUPPORT', 'TOP'], 'TOP')).toEqual(['TOP', 'SUPPORT'])
    expect(championRoles(['SUPPORT', 'TOP'], 'SUPPORT')).toEqual(['SUPPORT', 'TOP'])
  })

  it('orders the rest by lane and not alphabetically', () => {
    // Alphabetically this would come out BOTTOM, JUNGLE, MIDDLE, SUPPORT.
    expect(championRoles(['SUPPORT', 'BOTTOM', 'MIDDLE', 'JUNGLE'], 'MIDDLE')).toEqual([
      'MIDDLE',
      'JUNGLE',
      'BOTTOM',
      'SUPPORT',
    ])
  })

  it('writes them the way they get read', () => {
    expect(formatRoles(['SUPPORT', 'TOP'], 'TOP')).toBe('Top, Soporte')
    expect(formatRoles(['MIDDLE'], 'MIDDLE')).toBe('Mid')
  })

  it('falls back to the dash when there is nothing to say', () => {
    expect(formatRoles([], null)).toBe('—')
    expect(championRoles([], null)).toEqual([])
  })

  it('keeps a role it has no name for instead of dropping it', () => {
    // An un-normalized row, or a lane Riot invents next season: something to
    // see, not something to swallow.
    expect(championRoles(['TOP', 'RARO'], 'TOP')).toEqual(['TOP', 'RARO'])
    expect(formatRoles(['TOP', 'RARO'], 'TOP')).toBe('Top, RARO')
  })

  it('survives a main role that is not in the list', () => {
    expect(championRoles(['TOP'], 'JUNGLE')).toEqual(['JUNGLE', 'TOP'])
  })
})

describe('the role filter', () => {
  const camille = { champion: 'Camille', position: 'TOP', positions: ['TOP', 'SUPPORT'] }
  const thresh = { champion: 'Thresh', position: 'SUPPORT', positions: ['SUPPORT'] }
  const ahri = { champion: 'Ahri', position: 'MIDDLE', positions: ['MIDDLE'] }
  const champions = [camille, thresh, ahri]

  it('takes a champion by any role it was played in', () => {
    // This is the bug: Camille had been played support and asking for supports
    // did not show her, because the filter only knew her commonest lane.
    expect(byRole(champions, role('Soporte')).map((row) => row.champion)).toEqual([
      'Camille',
      'Thresh',
    ])
  })

  it('still takes it by its main one', () => {
    expect(byRole(champions, role('Top')).map((row) => row.champion)).toEqual(['Camille'])
  })

  it('leaves out the ones that never played there', () => {
    expect(byRole(champions, role('Jungla'))).toEqual([])
  })

  it('shows everybody with no role chosen', () => {
    expect(byRole(champions, null)).toHaveLength(3)
  })

  it('still matches on the single role of a row that has no list', () => {
    // Players come through the same filter and carry one `position`, which is
    // a mode as well: filling in another lane does not move them.
    const players = [
      { player_id: 'p1', position: 'JUNGLE' },
      { player_id: 'p2', position: 'SUPPORT' },
    ]

    expect(byRole(players, role('Jungla')).map((row) => row.player_id)).toEqual(['p1'])
  })
})
