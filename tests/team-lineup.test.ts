import type { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from './helpers/db'
import { playScoreboard } from './helpers/matches'

/**
 * The lineup a visitor sees.
 *
 * `team_lineup` returns slots, not players: the five roles are always there and
 * the bench comes from how many the team signed up on the sheet. The nick
 * appears in its slot once that person has played; until then the slot stays
 * empty and the page draws it with the role's name.
 */

interface SlotRow {
  slot: number
  role: string | null
  sub_number: number | null
  is_substitute: boolean
  player_id: string | null
  name: string | null
  games: number
}

describe('team lineup', () => {
  let db: PGlite
  let tournamentId: string
  let team01: string
  let team07: string
  let universityId: string
  const matchup: string[] = []

  beforeEach(async () => {
    db = await createTestDb()

    const tournament = await db.query<{ id: string }>(
      `insert into public.tournaments (name, slug) values ('LIDE 2', 'lide-2') returning id`,
    )
    tournamentId = tournament.rows[0].id

    const university = await db.query<{ id: string }>(
      `insert into public.universities (name, tag) values ('Universidad Nacional de La Plata', 'UNLP')
       returning id`,
    )
    universityId = university.rows[0].id

    const teams = await db.query<{ id: string; name: string }>(
      `insert into public.teams (tournament_id, name, group_label, university_id)
       values ($1, 'Equipo 01', 'Grupo A', $2), ($1, 'Equipo 07', 'Grupo A', $2)
       returning id, name`,
      [tournamentId, universityId],
    )
    team01 = teams.rows.find((row) => row.name === 'Equipo 01')!.id
    team07 = teams.rows.find((row) => row.name === 'Equipo 07')!.id

    for (const matchday of [1, 2, 3]) {
      const { rows } = await db.query<{ id: string }>(
        `insert into public.fixtures
           (tournament_id, group_label, matchday, slot, kickoff, team_a_id, team_b_id)
         values ($1, 'Grupo A', $2, 1, '2026-09-05T17:00:00Z', $3, $4)
         returning id`,
        [tournamentId, matchday, team01, team07],
      )
      matchup.push(rows[0].id)
    }
  }, 60_000)

  afterEach(async () => {
    matchup.length = 0
    await db?.close()
  })

  /** Signs people up on Team 01's sheet. Legal names, as in real life. */
  async function anotar(...names: string[]) {
    for (const [index, name] of names.entries()) {
      await db.query(
        `insert into public.team_roster (team_id, full_name, university_id, order_index)
         values ($1, $2, $3, $4)`,
        [team01, name, universityId, index],
      )
    }
  }

  /**
   * Plays a matchday: Team 01's five nicks in lane order and five throwaways on
   * the other side. Assigning the matchup is what teaches the database who
   * plays for each team.
   */
  async function jugarFecha(matchday: number, nicks: string[]) {
    const matchId = await playScoreboard(db, {
      winner: 'blue',
      blue: nicks.map((nick) => ({ puuid: `puuid-${nick}`, kills: 2, deaths: 1, assists: 3 })),
      red: ['r1', 'r2', 'r3', 'r4', 'r5'].map((puuid) => ({ puuid, kills: 1, deaths: 2 })),
    })

    for (const nick of nicks) {
      await db.query(`update public.players set riot_game_name = $1 where puuid = $2`, [
        nick,
        `puuid-${nick}`,
      ])
    }

    await db.query('select public.assign_match_to_fixture($1, $2, $3)', [
      matchId,
      matchup[matchday - 1],
      team01,
    ])

    return matchId
  }

  async function roster(teamId: string): Promise<SlotRow[]> {
    const { rows } = await db.query<SlotRow>(
      `select slot, role, sub_number, is_substitute, player_id, name, games
         from public.team_lineup where team_id = $1 order by slot`,
      [teamId],
    )
    return rows.map((row) => ({ ...row, games: Number(row.games) }))
  }

  it('the five slots exist before a single replay is uploaded', async () => {
    const rows = await roster(team07)

    expect(rows.map((r) => r.role)).toEqual(['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'SUPPORT'])
    expect(rows.every((r) => r.player_id === null)).toBe(true)
    expect(rows.every((r) => r.is_substitute === false)).toBe(true)
  })

  it('each nick lands in the lane they played', async () => {
    await jugarFecha(1, ['Alfa', 'Bravo', 'Charlie', 'Delta', 'Eco'])

    const rows = await roster(team01)

    expect(rows.map((r) => [r.role, r.name])).toEqual([
      ['TOP', 'Alfa'],
      ['JUNGLE', 'Bravo'],
      ['MIDDLE', 'Charlie'],
      ['BOTTOM', 'Delta'],
      ['SUPPORT', 'Eco'],
    ])
    expect(rows.every((r) => r.games === 1)).toBe(true)
  })

  it('whoever rotates lanes ends up in the one they played most', async () => {
    // In the first, Alfa plays top and Charlie mid; in the other two, the reverse.
    await jugarFecha(1, ['Alfa', 'Bravo', 'Charlie', 'Delta', 'Eco'])
    await jugarFecha(2, ['Charlie', 'Bravo', 'Alfa', 'Delta', 'Eco'])
    await jugarFecha(3, ['Charlie', 'Bravo', 'Alfa', 'Delta', 'Eco'])

    const rows = await roster(team01)
    const porRol = new Map(rows.map((r) => [r.role, r.name]))

    expect(porRol.get('MIDDLE')).toBe('Alfa')
    expect(porRol.get('TOP')).toBe('Charlie')
    // Both are starters: nobody ends up on the bench for having rotated.
    expect(rows).toHaveLength(5)
  })

  it('one signup too many leaves a bench slot waiting, and the sixth to play fills it', async () => {
    await anotar('Uno', 'Dos', 'Tres', 'Cuatro', 'Cinco', 'Seis')

    const vacio = await roster(team01)
    expect(vacio).toHaveLength(6)
    expect(vacio[5]).toMatchObject({ slot: 6, role: null, sub_number: 1, is_substitute: true })
    expect(vacio[5].player_id).toBeNull()

    await jugarFecha(1, ['Alfa', 'Bravo', 'Charlie', 'Delta', 'Eco'])
    await jugarFecha(2, ['Alfa', 'Bravo', 'Charlie', 'Delta', 'Eco'])
    // Foxtrot plays support in the third. The role's starter is still Eco, who
    // played it twice; Foxtrot fills the bench slot.
    await jugarFecha(3, ['Alfa', 'Bravo', 'Charlie', 'Delta', 'Foxtrot'])

    const rows = await roster(team01)
    expect(rows.map((r) => r.name)).toEqual(['Alfa', 'Bravo', 'Charlie', 'Delta', 'Eco', 'Foxtrot'])
    expect(rows[5]).toMatchObject({ role: null, sub_number: 1, is_substitute: true, games: 1 })
  })

  it('if more accounts turn up than signups, the bench grows anyway', async () => {
    // Nobody on the sheet: the accounts are what set the bench slots.
    await jugarFecha(1, ['Alfa', 'Bravo', 'Charlie', 'Delta', 'Eco'])
    await jugarFecha(2, ['Alfa', 'Bravo', 'Charlie', 'Delta', 'Eco'])
    await jugarFecha(3, ['Alfa', 'Bravo', 'Charlie', 'Delta', 'Foxtrot'])

    const rows = await roster(team01)
    expect(rows).toHaveLength(6)
    expect(rows[5].name).toBe('Foxtrot')
  })

  it('the signups never leave: the sheet yields a number and nothing else', async () => {
    await anotar('Nombre Legal De Una Persona', 'Otro Nombre Legal')

    const { rows } = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'team_lineup'`,
    )

    expect(rows.map((r) => r.column_name).sort()).toEqual([
      // `assigned_role` is the hand assignment exactly as stored (0020); the
      // effective one - which may come from the matches - is still `role`.
      'assigned_role',
      // `game_name` and `tag_line` are the Riot account, which has always been
      // public (`player_profiles`). The sheet's name is not there.
      'game_name',
      'games',
      'is_substitute',
      'name',
      'player_id',
      'role',
      'slot',
      'sub_number',
      'tag_line',
      'team_id',
    ])

    const rosterOf01 = await roster(team01)
    expect(rosterOf01.map((r) => r.name)).not.toContain('Nombre Legal De Una Persona')
  })
})

describe('support is called SUPPORT', () => {
  let db: PGlite

  beforeEach(async () => {
    db = await createTestDb()
  }, 60_000)

  afterEach(async () => {
    await db?.close()
  })

  it('UTILITY is normalized on write, wherever it comes from', async () => {
    const matchId = await playScoreboard(db, {
      winner: 'blue',
      blue: [{ puuid: 'sup', position: 'UTILITY' }],
      red: [{ puuid: 'otro', position: 'utility' }],
    })

    const { rows } = await db.query<{ position: string }>(
      'select position from public.match_players where match_id = $1',
      [matchId],
    )
    expect(rows.map((r) => r.position)).toEqual(['SUPPORT', 'SUPPORT'])

    // And it does not get in through a hand-written update either.
    await db.query(`update public.match_players set position = 'UTILITY' where match_id = $1`, [
      matchId,
    ])
    const despues = await db.query<{ position: string }>(
      'select distinct position from public.match_players where match_id = $1',
      [matchId],
    )
    expect(despues.rows).toEqual([{ position: 'SUPPORT' }])
  })
})
