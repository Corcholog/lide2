import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb } from './helpers/db'
import { playScoreboard } from './helpers/matches'

/**
 * What is visible without a session.
 *
 * This is the only thing that really verifies migration 0013: the publishable
 * key travels to the browser, so anybody can hit PostgREST directly. The pages
 * not showing something proves nothing; what proves it is the database not
 * handing it over.
 *
 * The tests run as the `anon` role, just like a visitor.
 */

async function asAnon<T>(db: PGlite, sql: string, params: unknown[] = []): Promise<T[]> {
  await db.exec('set role anon')
  try {
    const { rows } = await db.query<T>(sql, params)
    return rows
  } finally {
    await db.exec('reset role')
  }
}

async function anonFails(db: PGlite, sql: string): Promise<string> {
  await db.exec('set role anon')
  try {
    await db.query(sql)
    return 'no fallo'
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  } finally {
    await db.exec('reset role')
  }
}

describe('public access', () => {
  let db: PGlite
  let tournamentId: string
  let team01: string

  beforeAll(async () => {
    db = await createTestDb()

    const tournament = await db.query<{ id: string }>(
      `insert into public.tournaments (name, slug) values ('LIDE 2', 'lide-2') returning id`,
    )
    tournamentId = tournament.rows[0].id

    const university = await db.query<{ id: string }>(
      `insert into public.universities (name, tag) values ('Universidad Nacional de La Plata', 'UNLP')
       returning id`,
    )

    const teams = await db.query<{ id: string; name: string }>(
      `insert into public.teams (tournament_id, name, group_label, university_id)
       values ($1, 'Equipo 01', 'Grupo A', $2), ($1, 'Equipo 07', 'Grupo A', $2)
       returning id, name`,
      [tournamentId, university.rows[0].id],
    )
    team01 = teams.rows.find((row) => row.name === 'Equipo 01')!.id
    const team07 = teams.rows.find((row) => row.name === 'Equipo 07')!.id

    await db.query(
      `insert into public.team_roster (team_id, full_name, university_id, order_index)
       values ($1, 'Nombre Legal De Una Persona', $2, 0)`,
      [team01, university.rows[0].id],
    )

    const fixture = await db.query<{ id: string }>(
      `insert into public.fixtures
         (tournament_id, group_label, matchday, slot, kickoff, team_a_id, team_b_id)
       values ($1, 'Grupo A', 1, 1, '2026-09-05T17:00:00Z', $2, $3)
       returning id`,
      [tournamentId, team01, team07],
    )

    const matchId = await playScoreboard(db, {
      winner: 'blue',
      blue: ['a1', 'a2', 'a3', 'a4', 'a5'].map((puuid) => ({
        puuid,
        kills: 3,
        deaths: 1,
        assists: 4,
      })),
      red: ['b1', 'b2', 'b3', 'b4', 'b5'].map((puuid) => ({ puuid, kills: 1, deaths: 3 })),
    })

    await db.query('select public.assign_match_to_fixture($1, $2, $3)', [
      matchId,
      fixture.rows[0].id,
      team01,
    ])
  }, 60_000)

  afterAll(async () => {
    await db?.close()
  })

  describe('what a visitor DOES see', () => {
    it('the tournament, the teams and the fixture', async () => {
      expect(await asAnon(db, 'select id from public.tournaments')).toHaveLength(1)
      expect(await asAnon(db, 'select id from public.teams')).toHaveLength(2)
      expect(await asAnon(db, 'select id from public.fixtures')).toHaveLength(1)
      expect(await asAnon(db, 'select id from public.universities')).toHaveLength(1)
    })

    it('the standings table and the matchup result', async () => {
      const standings = await asAnon<{ team_name: string; wins: number }>(
        db,
        'select team_name, wins from public.group_standings order by team_name',
      )
      expect(standings.map((r) => [r.team_name, Number(r.wins)])).toEqual([
        ['Equipo 01', 1],
        ['Equipo 07', 0],
      ])

      const fixture = await asAnon<{ status: string }>(
        db,
        'select status from public.fixture_results',
      )
      expect(fixture[0].status).toBe('jugado')
    })

    it('the match scoreboard, with items and spells', async () => {
      const rows = await asAnon<{ champion: string; items: number[] }>(
        db,
        'select champion, items from public.match_player_scores',
      )
      expect(rows).toHaveLength(10)
    })

    it('the stats', async () => {
      expect(await asAnon(db, 'select * from public.player_totals')).toHaveLength(10)
      expect(await asAnon(db, 'select * from public.match_summaries')).toHaveLength(1)
      expect(await asAnon(db, 'select * from public.university_totals')).not.toHaveLength(0)
      expect(await asAnon(db, 'select * from public.match_records')).toHaveLength(1)

      // The Tables tab's meta. It is the only way to catch a misplaced
      // `security_invoker`: the symptom would be zero rows with no error at
      // all, and only for somebody without a session - which is to say
      // invisible in development, where you are always signed in.
      expect(await asAnon(db, 'select * from public.champion_meta')).not.toHaveLength(0)
    })

    it('the new match_summaries columns', async () => {
      // The scope and the draft's state (0021): /partidas' filters and the
      // panel's "sin draft" badge come from here.
      const rows = await asAnon<{ matchday: number | null; ban_count: number }>(
        db,
        'select matchday, group_label, ban_count from public.match_summaries',
      )
      expect(rows[0].ban_count).toBe(0)
    })

    it("a player's page and a team's lineup", async () => {
      expect(await asAnon(db, 'select * from public.player_profiles')).toHaveLength(10)
      expect(
        await asAnon(db, `select * from public.team_accounts where team_id = '${team01}'`),
      ).toHaveLength(5)

      // The lineup is what a visitor sees on the team page: the five slots
      // with the nick of whoever plays them. The view reads team_roster to
      // count the signups, so it runs as definer; that an `anon` can read it is
      // precisely what has to be proven.
      const roster = await asAnon<{ role: string | null; name: string | null }>(
        db,
        `select role, name from public.team_lineup where team_id = '${team01}' order by slot`,
      )
      expect(roster.map((r) => r.role)).toEqual([
        'TOP',
        'JUNGLE',
        'MIDDLE',
        'BOTTOM',
        'SUPPORT',
      ])
      expect(roster.every((r) => r.name !== null)).toBe(true)
    })
  })

  describe('what a visitor does NOT see', () => {
    it('no public view returns a puuid column', async () => {
      const rows = await asAnon<{ table_name: string }>(
        db,
        `select table_name from information_schema.columns
          where table_schema = 'public' and column_name = 'puuid'`,
      )

      // Only the raw tables, which are not readable without a session.
      expect(rows.map((r) => r.table_name).sort()).toEqual(['match_players', 'players'])
    })

    it('the tables with puuid or raw JSON return no rows', async () => {
      expect(await asAnon(db, 'select id from public.players')).toHaveLength(0)
      expect(await asAnon(db, 'select id from public.match_players')).toHaveLength(0)
      expect(await asAnon(db, 'select id from public.matches')).toHaveLength(0)
    })

    it("the signups' legal names", async () => {
      expect(await asAnon(db, 'select id from public.team_roster')).toHaveLength(0)
      expect(await asAnon(db, 'select * from public.roster_status')).toHaveLength(0)
    })

    it('the storage files nor the ingest failures', async () => {
      expect(await asAnon(db, 'select id from public.match_files')).toHaveLength(0)
      expect(await asAnon(db, 'select id from public.ingest_failures')).toHaveLength(0)
    })

    it("the panel's queue", async () => {
      expect(await asAnon(db, 'select * from public.unassigned_matches')).toHaveLength(0)
    })

    it('nor can it write', async () => {
      expect(
        await anonFails(db, `insert into public.teams (name) values ('Equipo Trucho')`),
      ).toMatch(/permission denied|policy/i)
      expect(await anonFails(db, 'delete from public.fixtures')).toMatch(
        /permission denied|policy/i,
      )
    })
  })

  describe("with a session the panel's data shows", () => {
    it('the same visitor, authenticated, does see the signups', async () => {
      await db.exec('set role authenticated')
      const { rows } = await db.query('select * from public.roster_status')
      await db.exec('reset role')

      expect(rows).toHaveLength(1)
    })
  })
})
