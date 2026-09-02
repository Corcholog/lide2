import type { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from './helpers/db'

/**
 * Saying by hand who an account belongs to.
 *
 * The case is Team 01 before matchday 1: the five nicks entered by hand, the
 * five signups from the sheet, and nobody who has played yet. The automatic
 * matching needs the sheet to carry the Riot ID; when it does not, this is the
 * only thing that closes the link.
 */

interface AssignResult {
  ok: boolean
  error?: string
  name?: string
  nick?: string
  cleared?: boolean
}

describe('assigning an account to a signup', () => {
  let db: PGlite
  let team01: string
  let team19: string
  const signup = new Map<string, string>()
  const cuenta = new Map<string, string>()

  // The full migrations per test: Postgres in WASM is slow, and vitest's
  // default for a hook is 10 seconds.
  beforeEach(async () => {
    db = await createTestDb()

    const teams = await db.query<{ id: string; name: string }>(
      `insert into public.teams (name) values ('Equipo 01'), ('Equipo 19') returning id, name`,
    )
    team01 = teams.rows.find((row) => row.name === 'Equipo 01')!.id
    team19 = teams.rows.find((row) => row.name === 'Equipo 19')!.id

    // Team 01's sheet, with no declared Riot ID: the case where the automatic
    // matching has nothing to work with.
    for (const [index, fullName] of ['Marcelo Condori', 'Facundo Subijana'].entries()) {
      const { rows } = await db.query<{ id: string }>(
        `insert into public.team_roster (team_id, full_name, order_index)
         values ($1, $2, $3) returning id`,
        [team01, fullName, index],
      )
      signup.set(fullName, rows[0].id)
    }

    for (const [team, nick, tag] of [
      [team01, 'LIDE CHAMPION', 'fkc'],
      [team01, 'Pachu', '777'],
      [team19, 'Azael', '026'],
    ] as const) {
      const { rows } = await db.query<{ add_team_account: { player_id: string } }>(
        'select public.add_team_account($1, $2, $3)',
        [team, nick, tag],
      )
      cuenta.set(nick, rows[0].add_team_account.player_id)
    }
  }, 60_000)

  afterEach(async () => {
    await db?.close()
  })

  async function assign(rosterId: string, playerId: string | null): Promise<AssignResult> {
    const { rows } = await db.query<{ assign_roster_account: AssignResult }>(
      'select public.assign_roster_account($1, $2)',
      [rosterId, playerId],
    )
    return rows[0].assign_roster_account
  }

  async function cuentaDe(fullName: string): Promise<string | null> {
    const { rows } = await db.query<{ player_id: string | null }>(
      'select player_id from public.team_roster where id = $1',
      [signup.get(fullName)],
    )
    return rows[0].player_id
  }

  it('matches a hand-entered nick with its owner', async () => {
    const result = await assign(signup.get('Marcelo Condori')!, cuenta.get('LIDE CHAMPION')!)

    expect(result.ok).toBe(true)
    expect(result.nick).toBe('LIDE CHAMPION#fkc')
    expect(result.name).toBe('Marcelo Condori')
    expect(await cuentaDe('Marcelo Condori')).toBe(cuenta.get('LIDE CHAMPION'))
  })

  it('makes it visible in roster_status, with the account and no matches', async () => {
    await assign(signup.get('Facundo Subijana')!, cuenta.get('Pachu')!)

    const { rows } = await db.query<{
      linked_game_name: string
      linked_tag_line: string
      declared_game_name: string | null
      games: number
    }>(
      `select linked_game_name, linked_tag_line, declared_game_name, games
         from public.roster_status where roster_id = $1`,
      [signup.get('Facundo Subijana')],
    )

    expect(rows[0].linked_game_name).toBe('Pachu')
    expect(rows[0].linked_tag_line).toBe('777')
    expect(Number(rows[0].games)).toBe(0)
    // The matching does not invent what the sheet never declared.
    expect(rows[0].declared_game_name).toBeNull()
  })

  it('does not accept an account from another team', async () => {
    const result = await assign(signup.get('Marcelo Condori')!, cuenta.get('Azael')!)

    expect(result.ok).toBe(false)
    expect(result.error).toContain('no esta en el plantel')
    expect(await cuentaDe('Marcelo Condori')).toBeNull()
  })

  it('does not take the account off another signup: it says whose it is', async () => {
    await assign(signup.get('Marcelo Condori')!, cuenta.get('Pachu')!)
    const result = await assign(signup.get('Facundo Subijana')!, cuenta.get('Pachu')!)

    expect(result.ok).toBe(false)
    expect(result.error).toBe('Pachu#777 ya es de Marcelo Condori.')
    expect(await cuentaDe('Marcelo Condori')).toBe(cuenta.get('Pachu'))
    expect(await cuentaDe('Facundo Subijana')).toBeNull()
  })

  it('unassigns with null, which is how a wrong match is undone', async () => {
    await assign(signup.get('Marcelo Condori')!, cuenta.get('Pachu')!)
    const result = await assign(signup.get('Marcelo Condori')!, null)

    expect(result.ok).toBe(true)
    expect(result.cleared).toBe(true)
    expect(await cuentaDe('Marcelo Condori')).toBeNull()

    // And the account is free for whoever it really belongs to.
    const otra = await assign(signup.get('Facundo Subijana')!, cuenta.get('Pachu')!)
    expect(otra.ok).toBe(true)
  })

  it('changing a signup account replaces the one they had', async () => {
    await assign(signup.get('Marcelo Condori')!, cuenta.get('Pachu')!)
    const result = await assign(signup.get('Marcelo Condori')!, cuenta.get('LIDE CHAMPION')!)

    expect(result.ok).toBe(true)
    expect(await cuentaDe('Marcelo Condori')).toBe(cuenta.get('LIDE CHAMPION'))
  })

  it('writes nothing when the signup does not exist', async () => {
    const result = await assign(
      '00000000-0000-0000-0000-000000000000',
      cuenta.get('LIDE CHAMPION')!,
    )

    expect(result.ok).toBe(false)
    expect(result.error).toBe('Ese inscripto no existe.')
  })

  it('the hand match beats the automatic one: link_roster_accounts does not trample it', async () => {
    await assign(signup.get('Marcelo Condori')!, cuenta.get('Pachu')!)

    // The sheet said something else, and it is loaded afterwards.
    await db.query(
      `update public.team_roster
          set riot_game_name = 'LIDE CHAMPION', riot_tag_line = 'fkc'
        where id = $1`,
      [signup.get('Marcelo Condori')],
    )
    await db.query('select public.link_roster_accounts($1)', [team01])

    expect(await cuentaDe('Marcelo Condori')).toBe(cuenta.get('Pachu'))
  })
})
