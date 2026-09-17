import type { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from './helpers/db'
import { playScoreboard } from './helpers/matches'

/**
 * A result the organizers overturn by ruling (0031_alineacion_indebida.sql):
 * the winner on the rift fielded an ineligible lineup, the matchup is awarded
 * to the other team, and the match stops counting for anything.
 *
 * Two risks are covered:
 *
 * Double counting. The walkover tool would require unlinking the match, which
 * then counts again from its file labels. So each team must have played one
 * game, not two.
 *
 * Leaks. The annulment must hold in every aggregate, including the four that
 * read `matches` directly; each is checked by name. What must stay (the
 * scoreboard, the listing entry) is checked too.
 */

interface Result {
  ok: boolean
  error?: string
  cleared?: boolean
  winner?: string
  sanctioned?: string
  annulled_match?: boolean
}

interface StandingRow {
  team_name: string
  games: number
  wins: number
  losses: number
  kill_diff: number
  position: number
}

describe('a result overturned by the rulebook', () => {
  let db: PGlite
  let tournamentId: string
  const team = new Map<string, string>()
  const matchupIds = new Map<string, string>()
  const matchIds = new Map<string, string>()

  beforeEach(async () => {
    db = await createTestDb()

    const tournament = await db.query<{ id: string }>(
      `insert into public.tournaments (name, slug, format)
       values ('LIDE 2', 'lide-2', 'grupos') returning id`,
    )
    tournamentId = tournament.rows[0].id

    for (const name of ['Equipo 06', 'Equipo 17', 'Equipo 11', 'Equipo 14']) {
      const { rows } = await db.query<{ id: string }>(
        `insert into public.teams (tournament_id, name, group_label)
         values ($1, $2, 'Grupo D') returning id`,
        [tournamentId, name],
      )
      team.set(name, rows[0].id)
    }

    const matchups: [number, string, string][] = [
      [2, 'Equipo 06', 'Equipo 17'],
      [2, 'Equipo 11', 'Equipo 14'],
      [3, 'Equipo 17', 'Equipo 11'],
      [3, 'Equipo 06', 'Equipo 14'],
    ]
    for (const [matchday, a, b] of matchups) {
      const { rows } = await db.query<{ id: string }>(
        `insert into public.fixtures
           (tournament_id, group_label, matchday, slot, kickoff, team_a_id, team_b_id)
         values ($1, 'Grupo D', $2, 1, '2026-09-12T17:00:00Z', $3, $4) returning id`,
        [tournamentId, matchday, team.get(a), team.get(b)],
      )
      matchupIds.set(`${a} vs ${b}`, rows[0].id)
    }
  }, 60_000)

  afterEach(async () => {
    team.clear()
    matchupIds.clear()
    matchIds.clear()
    await db?.close()
  })

  /**
   * Plays a matchup with a full scoreboard and links it to its fixture.
   *
   * `kills` is per side, spread over the five players (25 is five each, 23 is
   * 5-5-5-4-4). The top laner's champion is unique per match, so a champion only
   * present in the annulled match can be searched for by name.
   */
  async function play(matchup: string, kills: [number, number], topChampion: string) {
    const [a, b] = matchup.split(' vs ')
    const spread = (total: number) => {
      const base = Math.floor(total / 5)
      return [0, 1, 2, 3, 4].map((i) => base + (i < total - base * 5 ? 1 : 0))
    }
    const tag = matchup.replace(/\W+/g, '')

    const matchId = await playScoreboard(db, {
      tournamentId,
      blueTeamId: team.get(a),
      redTeamId: team.get(b),
      winner: kills[0] > kills[1] ? 'blue' : 'red',
      blue: spread(kills[0]).map((k, i) => ({
        puuid: `${tag}-azul-${i}`,
        champion: i === 0 ? `${topChampion}Azul` : 'Ahri',
        kills: k,
      })),
      red: spread(kills[1]).map((k, i) => ({
        puuid: `${tag}-rojo-${i}`,
        champion: i === 0 ? topChampion : 'Zed',
        kills: k,
      })),
    })

    await db.query(`update public.fixtures set match_id = $1 where id = $2`, [
      matchId,
      matchupIds.get(matchup),
    ])
    matchIds.set(matchup, matchId)
    return matchId
  }

  async function rule(matchup: string, winner: string | null, ruling = 'alineacion_indebida') {
    const { rows } = await db.query<{ set_fixture_ruling: Result }>(
      'select public.set_fixture_ruling($1, $2, $3)',
      [matchupIds.get(matchup), winner ? team.get(winner) : null, ruling],
    )
    return rows[0].set_fixture_ruling
  }

  async function standings(): Promise<Map<string, StandingRow>> {
    const { rows } = await db.query<StandingRow>(
      `select team_name, games::int, wins::int, losses::int, kill_diff::int, position::int
         from public.group_standings where tournament_id = $1`,
      [tournamentId],
    )
    return new Map(rows.map((row) => [row.team_name, row]))
  }

  async function count(sql: string, params: unknown[] = []): Promise<number> {
    const { rows } = await db.query<{ n: number }>(sql, params)
    return Number(rows[0].n)
  }

  describe('the table', () => {
    it('before the ruling, it has the result that was played', async () => {
      await play('Equipo 06 vs Equipo 17', [23, 25], 'Camille')

      const rows = await standings()
      expect(rows.get('Equipo 17')).toMatchObject({ wins: 1, losses: 0 })
      expect(rows.get('Equipo 06')).toMatchObject({ wins: 0, losses: 1 })
    })

    it('after it, the win changes hands and each side has played ONE game', async () => {
      await play('Equipo 06 vs Equipo 17', [23, 25], 'Camille')
      const result = await rule('Equipo 06 vs Equipo 17', 'Equipo 06')

      expect(result).toMatchObject({
        ok: true,
        winner: 'Equipo 06',
        sanctioned: 'Equipo 17',
        annulled_match: true,
      })

      const rows = await standings()
      // One game each, not two: the played result is replaced, not added.
      expect(rows.get('Equipo 06')).toMatchObject({ games: 1, wins: 1, losses: 0 })
      expect(rows.get('Equipo 17')).toMatchObject({ games: 1, wins: 0, losses: 1 })
    })

    it('carries no kills from the annulled match', async () => {
      await play('Equipo 06 vs Equipo 17', [23, 25], 'Camille')
      await rule('Equipo 06 vs Equipo 17', 'Equipo 06')

      const rows = await standings()
      expect(rows.get('Equipo 06')?.kill_diff).toBe(0)
      expect(rows.get('Equipo 17')?.kill_diff).toBe(0)
    })

    it('counts the ruling for the head to head, against the kill difference', async () => {
      /*
       * 06 and 17 finish level at 1-1, and 17 has the far better kill difference.
       * The awarded game between them puts 06 above.
       */
      await play('Equipo 06 vs Equipo 17', [23, 25], 'Camille')
      await play('Equipo 17 vs Equipo 11', [30, 2], 'Garen')
      await play('Equipo 06 vs Equipo 14', [2, 30], 'Darius')
      await rule('Equipo 06 vs Equipo 17', 'Equipo 06')

      const rows = await standings()
      const six = rows.get('Equipo 06')!
      const seventeen = rows.get('Equipo 17')!

      expect([six.wins, six.losses]).toEqual([1, 1])
      expect([seventeen.wins, seventeen.losses]).toEqual([1, 1])
      expect(seventeen.kill_diff).toBeGreaterThan(six.kill_diff)
      expect(six.position).toBeLessThan(seventeen.position)
    })
  })

  describe('the fixture', () => {
    it('names the ruling instead of a scoreline', async () => {
      await play('Equipo 06 vs Equipo 17', [23, 25], 'Camille')
      await rule('Equipo 06 vs Equipo 17', 'Equipo 06')

      const { rows } = await db.query(
        `select status, winner_team_id, team_a_win, team_b_win, team_a_kills, team_b_kills,
                ruling, match_id, walkover_team_id
           from public.fixture_results where id = $1`,
        [matchupIds.get('Equipo 06 vs Equipo 17')],
      )

      expect(rows[0]).toMatchObject({
        status: 'reglamento',
        winner_team_id: team.get('Equipo 06'),
        team_a_win: true,
        team_b_win: false,
        // The 23-25 is no longer a result, so no score is shown.
        team_a_kills: null,
        team_b_kills: null,
        ruling: 'alineacion_indebida',
        // Still the same match: nothing was unlinked.
        match_id: matchIds.get('Equipo 06 vs Equipo 17'),
        walkover_team_id: null,
      })
    })
  })

  describe('the statistics', () => {
    /*
     * One check per aggregate, by name: the two base views cover most, but four
     * read `matches` directly.
     */
    beforeEach(async () => {
      await play('Equipo 06 vs Equipo 17', [23, 25], 'Camille')
      await play('Equipo 11 vs Equipo 14', [10, 12], 'Garen')
      await rule('Equipo 06 vs Equipo 17', 'Equipo 06')
    })

    const annulled = () => matchIds.get('Equipo 06 vs Equipo 17')

    it('marks the match as annulled, in one place', async () => {
      expect(
        await count(`select count(*) as n from public.match_context where match_id = $1 and annulled`, [
          annulled(),
        ]),
      ).toBe(1)
    })

    it('leaves it out of the player base and everything built on it', async () => {
      expect(
        await count(`select count(*) as n from public.player_match_stats where match_id = $1`, [annulled()]),
      ).toBe(0)
      // A champion only played in that match does not appear in the champion stats.
      expect(
        await count(`select count(*) as n from public.champion_meta where champion = 'Camille'`),
      ).toBe(0)
      expect(
        await count(`select count(*) as n from public.champion_stats where champion = 'Camille'`),
      ).toBe(0)
    })

    it('leaves it out of the team base', async () => {
      expect(
        await count(`select count(*) as n from public.team_match_results where match_id = $1`, [annulled()]),
      ).toBe(0)
    })

    it('leaves it out of the four that read matches directly', async () => {
      expect(
        await count(`select count(*) as n from public.match_records where match_id = $1`, [annulled()]),
      ).toBe(0)

      const games = await count(
        `select coalesce(sum(games), 0) as n from public.team_totals where team_id = any($1::uuid[])`,
        [[team.get('Equipo 06'), team.get('Equipo 17')]],
      )
      expect(games).toBe(0)

      const players = `select distinct player_id from public.match_players where match_id = $1`
      expect(
        await count(`select count(*) as n from public.player_totals where player_id in (${players})`, [
          annulled(),
        ]),
      ).toBe(0)
      expect(
        await count(
          `select count(*) as n from public.player_champion_totals where player_id in (${players})`,
          [annulled()],
        ),
      ).toBe(0)
    })

    it('does not touch the match that was played fairly', async () => {
      const fair = matchIds.get('Equipo 11 vs Equipo 14')

      expect(
        await count(`select count(*) as n from public.player_match_stats where match_id = $1`, [fair]),
      ).toBe(10)
      expect(
        await count(`select count(*) as n from public.match_records where match_id = $1`, [fair]),
      ).toBe(1)
    })

    it('keeps the scoreboard and the match in the listing, marked', async () => {
      // The evidence stays; only the counting stops.
      expect(
        await count(`select count(*) as n from public.match_player_scores where match_id = $1`, [annulled()]),
      ).toBe(10)
      expect(
        await count(`select count(*) as n from public.match_team_stats where match_id = $1`, [annulled()]),
      ).toBe(2)

      const { rows } = await db.query(
        `select annulled, ruling, ruling_winner_team_id from public.match_summaries where id = $1`,
        [annulled()],
      )
      expect(rows[0]).toMatchObject({
        annulled: true,
        ruling: 'alineacion_indebida',
        ruling_winner_team_id: team.get('Equipo 06'),
      })
    })
  })

  describe('undoing it', () => {
    it('gives back the played result and its statistics', async () => {
      await play('Equipo 06 vs Equipo 17', [23, 25], 'Camille')
      await rule('Equipo 06 vs Equipo 17', 'Equipo 06')
      const result = await rule('Equipo 06 vs Equipo 17', null)

      expect(result).toMatchObject({ ok: true, cleared: true })

      const rows = await standings()
      expect(rows.get('Equipo 17')).toMatchObject({ games: 1, wins: 1, losses: 0 })
      expect(
        await count(`select count(*) as n from public.champion_meta where champion = 'Camille'`),
      ).toBeGreaterThan(0)
    })
  })

  describe('what it refuses', () => {
    it('a team that does not play the matchup', async () => {
      await play('Equipo 06 vs Equipo 17', [23, 25], 'Camille')
      const result = await rule('Equipo 06 vs Equipo 17', 'Equipo 11')

      expect(result).toMatchObject({ ok: false, error: 'Ese equipo no juega este cruce.' })
    })

    it('a reason the site has no name for', async () => {
      await play('Equipo 06 vs Equipo 17', [23, 25], 'Camille')
      const result = await rule('Equipo 06 vs Equipo 17', 'Equipo 06', 'unknown_reason')

      expect(result).toMatchObject({ ok: false, error: 'Ese motivo no existe.' })
    })

    it('a matchup already awarded as a walkover', async () => {
      await db.query(`update public.fixtures set walkover_team_id = $1 where id = $2`, [
        team.get('Equipo 11'),
        matchupIds.get('Equipo 11 vs Equipo 14'),
      ])
      const result = await rule('Equipo 11 vs Equipo 14', 'Equipo 14')

      expect(result.ok).toBe(false)
    })

    it('a walkover and a ruling on the same matchup, even written by hand', async () => {
      await expect(
        db.query(
          `update public.fixtures
              set walkover_team_id = team_a_id, ruling_winner_team_id = team_b_id,
                  ruling = 'alineacion_indebida'
            where id = $1`,
          [matchupIds.get('Equipo 11 vs Equipo 14')],
        ),
      ).rejects.toThrow(/fixtures_ruling_or_walkover/)
    })

    it('anon cannot execute it', async () => {
      await db.exec('set role anon')
      try {
        await expect(
          db.query(`select public.set_fixture_ruling($1, null)`, [matchupIds.get('Equipo 06 vs Equipo 17')]),
        ).rejects.toThrow(/permission denied|permiso denegado/i)
      } finally {
        await db.exec('reset role')
      }
    })
  })
})
