import type { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from './helpers/db'
import { playScoreboard } from './helpers/matches'

/**
 * Saying by hand which lane an account plays.
 *
 * The case is the same as the manual entry (0017) and the manual matching
 * (0019): before matchday 1 there is not one match to deduce anything from, and
 * whoever entered the team's nicks already knows who plays where because they
 * were told at signup.
 *
 * Since 0023 that is all it is: a provisional. It fills the lineup while there
 * are no replays and loses against the first one, because what somebody was
 * told at signup can be out of date by Sunday and the scoreboard cannot.
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
  const cuenta = new Map<string, string>()

  // The full migrations per test: Postgres in WASM is slow, and vitest's
  // default for a hook is 10 seconds.
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
      cuenta.set(nick, rows[0].add_team_account.player_id)
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
    const result = await assign(cuenta.get('Corcho')!, 'TOP')
    expect(result.ok).toBe(true)
    expect(result.name).toBe('Corcho')

    const rows = await roster()
    const top = rows.find((r) => r.slot === 1)!
    expect(top.role).toBe('TOP')
    expect(top.player_id).toBe(cuenta.get('Corcho'))
    expect(top.assigned_role).toBe('TOP')

    // The other four lanes stay empty, and Pachu - who has nothing assigned
    // and has not played - stays in the pool with no lane.
    expect(rows.filter((r) => r.role !== null && r.player_id !== null)).toHaveLength(1)
    expect(rows.filter((r) => r.role === null && r.player_id !== null)).toEqual([
      expect.objectContaining({ player_id: cuenta.get('Pachu'), assigned_role: null }),
    ])
  })

  it('accepts the position in lower case, as somebody would type it', async () => {
    const result = await assign(cuenta.get('Corcho')!, 'support')
    expect(result.ok).toBe(true)
    expect(result.role).toBe('SUPPORT')
  })

  it('rejects a lane that does not exist', async () => {
    const result = await assign(cuenta.get('Corcho')!, 'CARRY')
    expect(result.ok).toBe(false)
    expect(result.error).toBe('Esa posición no existe.')
  })

  it('rejects an account that is not on this team', async () => {
    const otroEquipo = await db.query<{ id: string }>(
      `insert into public.teams (name) values ('Equipo 02') returning id`,
    )
    const { rows } = await db.query<{ add_team_account: { player_id: string } }>(
      'select public.add_team_account($1, $2, $3)',
      [otroEquipo.rows[0].id, 'DeOtroLado', 'xyz'],
    )
    const ajena = rows[0].add_team_account.player_id

    const result = await assign(ajena, 'TOP')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('no está en el plantel')
  })

  it('what was played beats what was entered by hand', async () => {
    // Somebody really played top. They are added to the roster by hand: it is
    // what `assign_match_to_fixture()` does in real life (0012_planteles.sql);
    // here the whole fixture is skipped because it is not what is under test.
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

    const { rows: jugador } = await db.query<{ id: string }>(
      `select id from public.players where puuid = 'p-corcho'`,
    )
    const queJugoTop = jugador[0].id

    await db.query(`insert into public.team_members (team_id, player_id) values ($1, $2)`, [
      team01,
      queJugoTop,
    ])

    const antes = await roster()
    expect(antes.find((r) => r.slot === 1)!.player_id).toBe(queJugoTop)

    // The signup sheet said support. It played top, so top is what it is: from
    // 0023 the sheet is a provisional that loses against the first replay.
    await assign(queJugoTop, 'SUPPORT')

    const despues = await roster()
    expect(despues.find((r) => r.slot === 1)!.player_id).toBe(queJugoTop)
    expect(despues.find((r) => r.slot === 5)!.player_id).toBeNull()
    // The hand assignment is still stored, and the dropdown still shows it:
    // it just no longer decides the slot.
    expect(despues.find((r) => r.slot === 1)!.assigned_role).toBe('SUPPORT')
  })

  it('two accounts assigned the same lane: one wins, the other drops to the bench', async () => {
    await assign(cuenta.get('Corcho')!, 'TOP')
    await assign(cuenta.get('Pachu')!, 'TOP')

    const rows = await roster()
    const top = rows.find((r) => r.slot === 1)!
    const banco = rows.filter((r) => r.role === null && r.player_id !== null)

    expect(banco).toHaveLength(1)
    expect([top.player_id, banco[0]?.player_id].sort()).toEqual(
      [cuenta.get('Corcho'), cuenta.get('Pachu')].sort(),
    )
  })

  it('the real Team 01: five hand-entered nicks end up in the lineup', async () => {
    // Five on the sheet and five nicks without a single match: the whole
    // roster was a pool with no lanes, which is where all of this came from.
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
      cuenta.set(nick, rows[0].add_team_account.player_id)
    }

    const antes = await roster()
    expect(antes.filter((r) => r.role === null && r.player_id !== null)).toHaveLength(5)

    const lines = [
      ['LIDE CHAMPION', 'TOP'],
      ['Corcho', 'JUNGLE'],
      ['Pachu', 'MIDDLE'],
      ['we1rdcat', 'BOTTOM'],
      ['the strange case', 'SUPPORT'],
    ] as const
    for (const [nick, role] of lines) await assign(cuenta.get(nick)!, role)

    // All five in their lane and not one extra row: the bench empties itself.
    const despues = await roster()
    expect(despues).toHaveLength(5)
    expect(despues.map((r) => [r.role, r.name])).toEqual([
      ['TOP', 'LIDE CHAMPION'],
      ['JUNGLE', 'Corcho'],
      ['MIDDLE', 'Pachu'],
      ['BOTTOM', 'we1rdcat'],
      ['SUPPORT', 'the strange case'],
    ])
  })

  it('clearing the assignment (null) returns the slot to "por confirmar"', async () => {
    await assign(cuenta.get('Corcho')!, 'TOP')
    const result = await assign(cuenta.get('Corcho')!, null)

    expect(result.ok).toBe(true)
    expect(result.role).toBeNull()

    const rows = await roster()
    expect(rows.find((r) => r.slot === 1)!.player_id).toBeNull()
    // The account is still on the roster, now on the bench with no lane.
    expect(rows.some((r) => r.player_id === cuenta.get('Corcho'))).toBe(true)
  })
})
