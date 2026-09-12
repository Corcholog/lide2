import { describe, expect, it } from 'vitest'
import { championRoles, formatRoles } from '@/lib/format'
import { byRole, championsInRole, parseRole, scopeCounts } from '@/lib/stats/tables'

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

describe('which champion rows a role asks for', () => {
  /*
   * `champion_meta` returns, for one scope, the row of each champion whole and
   * one row per role it was played in. Choosing a role is choosing which of
   * those to read - so the numbers on screen are that role's - and not throwing
   * rows away, which is what it used to do and is why a filtered Camille showed
   * the stats of her three picks when only one of them was the role asked for.
   */
  const rows = [
    { champion: 'Camille', all_roles: true, position: 'TOP', picks: 3 },
    { champion: 'Camille', all_roles: false, position: 'TOP', picks: 2 },
    { champion: 'Camille', all_roles: false, position: 'SUPPORT', picks: 1 },
    { champion: 'Thresh', all_roles: true, position: 'SUPPORT', picks: 4 },
    { champion: 'Thresh', all_roles: false, position: 'SUPPORT', picks: 4 },
    { champion: 'Ahri', all_roles: true, position: 'MIDDLE', picks: 2 },
    { champion: 'Ahri', all_roles: false, position: 'MIDDLE', picks: 2 },
  ]

  it('gives the whole champion when no role is chosen', () => {
    expect(championsInRole(rows, null).map((row) => [row.champion, row.picks])).toEqual([
      ['Camille', 3],
      ['Thresh', 4],
      ['Ahri', 2],
    ])
  })

  it('gives the numbers of that role and not of the champion', () => {
    const support = championsInRole(rows, role('Soporte'))

    // One pick, not three: this is the whole point of the change.
    expect(support.map((row) => [row.champion, row.picks])).toEqual([
      ['Camille', 1],
      ['Thresh', 4],
    ])
  })

  it('takes a champion by a role that is not its commonest', () => {
    // Camille's main lane is top, and she still has to answer to support.
    expect(championsInRole(rows, role('Soporte')).map((row) => row.champion)).toContain('Camille')
  })

  it('never mixes the whole-champion row into a filtered table', () => {
    // That row would double the champion and carry the wrong numbers with it.
    expect(championsInRole(rows, role('Top')).every((row) => !row.all_roles)).toBe(true)
    expect(championsInRole(rows, role('Top')).map((row) => row.picks)).toEqual([2])
  })

  it('leaves out the ones that never played there', () => {
    expect(championsInRole(rows, role('Jungla'))).toEqual([])
  })

  it('still fills the table from a view that has no role dimension yet', () => {
    // The column arrives with 0030 and the code deploys before the migration
    // is run. Every row of the old view is a whole champion, and the unfiltered
    // table - the one everybody lands on - has to keep working.
    const old = [
      { champion: 'Camille', position: 'TOP', picks: 3 },
      { champion: 'Thresh', position: 'SUPPORT', picks: 4 },
    ]

    expect(championsInRole(old, null)).toHaveLength(2)
  })
})

describe('the size of the scope', () => {
  /*
   * It is read off a whole-champion row and never off a per-role one: ask for a
   * role nobody played and there are no rows of that kind, and the page would
   * answer "nothing has been played here" about a tournament that is half over.
   */
  const rows = [
    { champion: 'Camille', all_roles: true, matches: 31, matches_with_bans: 4 },
    { champion: 'Camille', all_roles: false, matches: 31, matches_with_bans: 4 },
  ]

  it('comes off the champion row', () => {
    expect(scopeCounts(rows)).toEqual({ matches: 31, withDraft: 4 })
  })

  it('survives a view that has no role dimension yet', () => {
    // The trap that broke the page: read as truthy, a missing `all_roles` finds
    // nothing and the whole tables page falls into its "nothing played" state.
    const old = [{ champion: 'Camille', matches: 31, matches_with_bans: 4 }]

    expect(scopeCounts(old)).toEqual({ matches: 31, withDraft: 4 })
  })

  it('is zero when there is nothing at all', () => {
    expect(scopeCounts([])).toEqual({ matches: 0, withDraft: 0 })
  })
})

describe('the role filter for players', () => {
  /*
   * Players keep the old behaviour, and should: `player_phase_totals.position`
   * is a `mode()`, so this picks who is drawn and their averages still hold
   * every game they played, filling in another lane included.
   */
  const players = [
    { player_id: 'p1', position: 'JUNGLE' },
    { player_id: 'p2', position: 'SUPPORT' },
  ]

  it('takes them by their role', () => {
    expect(byRole(players, role('Jungla')).map((row) => row.player_id)).toEqual(['p1'])
  })

  it('shows everybody with no role chosen', () => {
    expect(byRole(players, null)).toHaveLength(2)
  })
})
