import type { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from './helpers/db'
import { playScoreboard } from './helpers/matches'

/**
 * Deleting a match uploaded by mistake.
 *
 * What has to be verified is not that the row goes away - that is a delete -
 * but that it takes exactly what existed because of it and nothing more: the
 * accounts that appeared in that replay and in no other, without touching the
 * fixture matchup or anything a person confirmed.
 */

interface DeleteResult {
  ok: boolean
  error?: string
  files?: number
  players?: string[]
}

const A = ['a1', 'a2', 'a3', 'a4', 'a5']
const B = ['b1', 'b2', 'b3', 'b4', 'b5']

const alineacion = (puuids: string[]) => puuids.map((puuid) => ({ puuid }))

describe('deleting a match', () => {
  let db: PGlite

  // The full migrations per test: Postgres in WASM is slow, and vitest's
  // default for a hook is 10 seconds.
  beforeEach(async () => {
    db = await createTestDb()
  }, 60_000)

  afterEach(async () => {
    await db?.close()
  })

  async function remove(matchId: string): Promise<DeleteResult> {
    const { rows } = await db.query<{ delete_match: DeleteResult }>(
      'select public.delete_match($1)',
      [matchId],
    )
    return rows[0].delete_match
  }

  async function contar(tabla: string): Promise<number> {
    const { rows } = await db.query<{ n: string }>(`select count(*) as n from public.${tabla}`)
    return Number(rows[0].n)
  }

  it('takes the match, its file and the accounts that only existed for it', async () => {
    const matchId = await playScoreboard(db, {
      winner: 'blue',
      blue: alineacion(A),
      red: alineacion(B),
    })

    await db.query(
      `insert into public.match_files (match_id, storage_path, file_name, file_size, sha256)
       values ($1, '2026-09/uno.rofl', 'Fecha 1.rofl', 15000000, 'sha-uno')`,
      [matchId],
    )

    const result = await remove(matchId)

    expect(result.ok).toBe(true)
    expect(result.files).toBe(1)
    expect(result.players).toHaveLength(10)

    expect(await contar('matches')).toBe(0)
    expect(await contar('match_players')).toBe(0)
    expect(await contar('match_files')).toBe(0)
    expect(await contar('players')).toBe(0)
  })

  it('does not touch anyone who played another one', async () => {
    await playScoreboard(db, { winner: 'blue', blue: alineacion(A), red: alineacion(B) })
    const segunda = await playScoreboard(db, {
      winner: 'red',
      blue: alineacion(A),
      red: alineacion(['c1', 'c2', 'c3', 'c4', 'c5']),
      playedAt: '2026-09-12T17:00:00Z',
    })

    const result = await remove(segunda)

    // A's five still play the first one; C's played nothing else.
    expect(result.players).toEqual(['c1', 'c2', 'c3', 'c4', 'c5'])
    expect(await contar('players')).toBe(10)
  })

  it('does not delete anyone on a roster or matched with a signup', async () => {
    const matchId = await playScoreboard(db, {
      winner: 'blue',
      blue: alineacion(A),
      red: alineacion(B),
    })

    const team = await db.query<{ id: string }>(
      `insert into public.teams (name) values ('Equipo 01') returning id`,
    )
    const teamId = team.rows[0].id

    await db.query(
      `insert into public.team_members (team_id, player_id)
       select $1, id from public.players where puuid = 'a1'`,
      [teamId],
    )
    await db.query(
      `insert into public.team_roster (team_id, full_name, order_index, player_id)
       select $1, 'Alguien de la planilla', 0, id from public.players where puuid = 'b1'`,
      [teamId],
    )

    const result = await remove(matchId)

    expect(result.players).toHaveLength(8)
    // The two that remain are accounts with no matches: a person put the
    // roster and the match together, and the deleted match does not undo
    // that.
    expect(await contar('players')).toBe(2)
    expect(await contar('team_members')).toBe(1)

    const signup = await db.query<{ player_id: string | null }>(
      'select player_id from public.team_roster',
    )
    expect(signup.rows[0].player_id).not.toBeNull()
  })

  it('the fixture matchup is freed, not deleted', async () => {
    const tournament = await db.query<{ id: string }>(
      `insert into public.tournaments (name, slug) values ('LIDE 2', 'lide-2') returning id`,
    )
    const teams = await db.query<{ id: string }>(
      `insert into public.teams (tournament_id, name)
       values ($1, 'Equipo 01'), ($1, 'Equipo 15') returning id`,
      [tournament.rows[0].id],
    )

    const matchId = await playScoreboard(db, {
      winner: 'blue',
      blue: alineacion(A),
      red: alineacion(B),
    })

    const fixture = await db.query<{ id: string }>(
      `insert into public.fixtures
         (tournament_id, group_label, matchday, slot, kickoff, team_a_id, team_b_id, match_id)
       values ($1, 'Grupo A', 1, 1, '2026-09-05T17:00:00Z', $2, $3, $4)
       returning id`,
      [tournament.rows[0].id, teams.rows[0].id, teams.rows[1].id, matchId],
    )

    expect((await remove(matchId)).ok).toBe(true)

    const { rows } = await db.query<{ match_id: string | null }>(
      'select match_id from public.fixtures where id = $1',
      [fixture.rows[0].id],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].match_id).toBeNull()
  })

  it('a match that does not exist is reported, not a crash', async () => {
    const result = await remove('00000000-0000-0000-0000-000000000000')

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/no existe/i)
  })
})
