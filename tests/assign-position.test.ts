import type { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from './helpers/db'
import { playScoreboard } from './helpers/matches'

/**
 * Setting an account's lane by hand, useful before any match is played (like
 * the manual account entry in 0017 and matching in 0019). Since 0023 the first
 * replay overrides it.
 */

interface AssignResult {
  ok: boolean
  error?: string
  name?: string
  role?: string | null
}

interface SlotRow {
  slot: number
  role: string | null
  player_id: string | null
  name: string | null
  assigned_role: string | null
}

describe('assigning an account lane by hand', () => {
  let db: PGlite
  let team01: string
  const account = new Map<string, string>()

  // Full migrations per test: PGlite is slow, and vitest's default hook timeout
  // is 10 seconds.
  beforeEach(async () => {
    db = await createTestDb()

    const teams = await db.query<{ id: string }>(
      `insert into public.teams (name) values ('Equipo 01') returning id`,
    )
    team01 = teams.rows[0].id

    for (const [nick, tag] of [
      ['Corcho', 'fkc'],
      ['Pachu', '777'],
    ] as const) {
      const { rows } = await db.query<{ add_team_account: { player_id: string } }>(
        'select public.add_team_account($1, $2, $3)',
        [team01, nick, tag],
      )
      account.set(nick, rows[0].add_team_account.player_id)
    }
  }, 60_000)

  afterEach(async () => {
    await db?.close()
  })

  async function assign(playerId: string, role: string | null): Promise<AssignResult> {
    const { rows } = await db.query<{ assign_team_member_role: AssignResult }>(
      'select public.assign_team_member_role($1, $2, $3)',
      [team01, playerId, role],
    )
    return rows[0].assign_team_member_role
  }

  async function roster(): Promise<SlotRow[]> {
    const { rows } = await db.query<SlotRow>(
      `select slot, role, player_id, name, assigned_role
         from public.team_lineup where team_id = $1 order by slot`,
      [team01],
    )
    return rows
  }

  it('with no match played, assigning the lane fills the slot', async () => {
    const result = await assign(account.get('Corcho')!, 'TOP')
    expect(result.ok).toBe(true)
    expect(result.name).toBe('Corcho')

    const rows = await roster()
    const top = rows.find((r) => r.slot === 1)!
    expect(top.role).toBe('TOP')
    expect(top.player_id).toBe(account.get('Corcho'))
    expect(top.assigned_role).toBe('TOP')

    // The other four lanes stay empty, and Pachu (no lane, no games) stays
    // unassigned.
    expect(rows.filter((r) => r.role !== null && r.player_id !== null)).toHaveLength(1)
    expect(rows.filter((r) => r.role === null && r.player_id !== null)).toEqual([
      expect.objectContaining({ player_id: account.get('Pachu'), assigned_role: null }),
    ])
  })

  it('accepts the position in lower case, as somebody would type it', async () => {
    const result = await assign(account.get('Corcho')!, 'support')
    expect(result.ok).toBe(true)
    expect(result.role).toBe('SUPPORT')
  })

  it('rejects a lane that does not exist', async () => {
    const result = await assign(account.get('Corcho')!, 'CARRY')
    expect(result.ok).toBe(false)
    expect(result.error).toBe('Esa posición no existe.')
  })

  it('rejects an account that is not on this team', async () => {
    const otherTeam = await db.query<{ id: string }>(
      `insert into public.teams (name) values ('Equipo 02') returning id`,
    )
    const { rows } = await db.query<{ add_team_account: { player_id: string } }>(
      'select public.add_team_account($1, $2, $3)',
      [otherTeam.rows[0].id, 'DeOtroLado', 'xyz'],
    )
    const foreign = rows[0].add_team_account.player_id

    const result = await assign(foreign, 'TOP')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('no está en el plantel')
  })

  it('what was played beats what was entered by hand', async () => {
    // Someone actually played top and is added to the roster by hand, as
    // `assign_match_to_fixture()` would do (0012_planteles.sql).
    await playScoreboard(db, {
      blueTeamId: team01,
      winner: 'blue',
      blue: [
        { puuid: 'p-corcho', position: 'TOP' },
        { puuid: 'p2', position: 'JUNGLE' },
        { puuid: 'p3', position: 'MIDDLE' },
        { puuid: 'p4', position: 'BOTTOM' },
        { puuid: 'p5', position: 'SUPPORT' },
      ],
      red: ['r1', 'r2', 'r3', 'r4', 'r5'].map((puuid) => ({ puuid })),
    })

    const { rows: player } = await db.query<{ id: string }>(
      `select id from public.players where puuid = 'p-corcho'`,
    )
    const topPlayer = player[0].id

    await db.query(`insert into public.team_members (team_id, player_id) values ($1, $2)`, [
      team01,
      topPlayer,
    ])

    const before = await roster()
    expect(before.find((r) => r.slot === 1)!.player_id).toBe(topPlayer)

    // Assigned support, but played top: since 0023 the replay wins.
    await assign(topPlayer, 'SUPPORT')

    const after = await roster()
    expect(after.find((r) => r.slot === 1)!.player_id).toBe(topPlayer)
    expect(after.find((r) => r.slot === 5)!.player_id).toBeNull()
    // The hand assignment is still stored for the dropdown; it no longer decides
    // the slot.
    expect(after.find((r) => r.slot === 1)!.assigned_role).toBe('SUPPORT')
  })

  it('two accounts assigned the same lane: one wins, the other drops to the bench', async () => {
    await assign(account.get('Corcho')!, 'TOP')
    await assign(account.get('Pachu')!, 'TOP')

    const rows = await roster()
    const top = rows.find((r) => r.slot === 1)!
    const bench = rows.filter((r) => r.role === null && r.player_id !== null)

    expect(bench).toHaveLength(1)
    expect([top.player_id, bench[0]?.player_id].sort()).toEqual(
      [account.get('Corcho'), account.get('Pachu')].sort(),
    )
  })

  it('the real Team 01: five hand-entered nicks end up in the lineup', async () => {
    // Five signups and five nicks without any match: no lanes yet.
    for (const [index, fullName] of ['Uno', 'Dos', 'Tres', 'Cuatro', 'Cinco'].entries()) {
      await db.query(
        `insert into public.team_roster (team_id, full_name, order_index) values ($1, $2, $3)`,
        [team01, fullName, index],
      )
    }
    for (const [nick, tag] of [
      ['LIDE CHAMPION', 'fkc'],
      ['we1rdcat', 'uwu'],
      ['the strange case', 'fkc'],
    ] as const) {
      const { rows } = await db.query<{ add_team_account: { player_id: string } }>(
        'select public.add_team_account($1, $2, $3)',
        [team01, nick, tag],
      )
      account.set(nick, rows[0].add_team_account.player_id)
    }

    const before = await roster()
    expect(before.filter((r) => r.role === null && r.player_id !== null)).toHaveLength(5)

    const lines = [
      ['LIDE CHAMPION', 'TOP'],
      ['Corcho', 'JUNGLE'],
      ['Pachu', 'MIDDLE'],
      ['we1rdcat', 'BOTTOM'],
      ['the strange case', 'SUPPORT'],
    ] as const
    for (const [nick, role] of lines) await assign(account.get(nick)!, role)

    // All five in their lanes, and no extra bench rows.
    const after = await roster()
    expect(after).toHaveLength(5)
    expect(after.map((r) => [r.role, r.name])).toEqual([
      ['TOP', 'LIDE CHAMPION'],
      ['JUNGLE', 'Corcho'],
      ['MIDDLE', 'Pachu'],
      ['BOTTOM', 'we1rdcat'],
      ['SUPPORT', 'the strange case'],
    ])
  })

  it('clearing the assignment (null) returns the slot to "por confirmar"', async () => {
    await assign(account.get('Corcho')!, 'TOP')
    const result = await assign(account.get('Corcho')!, null)

    expect(result.ok).toBe(true)
    expect(result.role).toBeNull()

    const rows = await roster()
    expect(rows.find((r) => r.slot === 1)!.player_id).toBeNull()
    // The account stays on the roster, on the bench without a lane.
    expect(rows.some((r) => r.player_id === account.get('Corcho'))).toBe(true)
  })
})
