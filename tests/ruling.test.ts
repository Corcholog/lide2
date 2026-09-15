import type { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from './helpers/db'
import { playScoreboard } from './helpers/matches'

/**
 * A result the organizers annul by the rulebook (0031_alineacion_indebida.sql).
 *
 * The real case: matchday 2, Equipo 06 vs Equipo 17. Team 17 won on the rift,
 * 25 to 23, with a lineup that was not its registered roster, and the result
 * was overturned - 06 wins, 17 loses, and the match itself stops counting for
 * anything.
 *
 * Two traps are what these tests are for.
 *
 * THE DOUBLE COUNT. The walkover tool cannot do this, because it needs the
 * match unhooked first, and an unhooked match falls back to its file labels
 * and is counted AGAIN - the win on the rift plus the awarded one. So the
 * first thing checked is that each team has played one game, not two.
 *
 * THE LEAK. "The match does not count" has to hold in every aggregate, and
 * four of them read `matches` directly instead of the two bases that were cut.
 * Each of those is checked by name. And what must NOT disappear - the
 * scoreboard, the match in the listing - is checked just as hard.
 */

interface Resultado {
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
  const cruce = new Map<string, string>()
  const partida = new Map<string, string>()

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
      cruce.set(`${a} vs ${b}`, rows[0].id)
    }
  }, 60_000)

  afterEach(async () => {
    team.clear()
    cruce.clear()
    partida.clear()
    await db?.close()
  })

  /**
   * Plays a matchup with a full scoreboard and hooks it to its fixture.
   *
   * `kills` is per side, spread over the five: 25 is five kills each, 23 is
   * 5-5-5-4-4. The champion of the top laner is one per match, so a champion
   * that only exists in the annulled match can be looked for by name.
   */
  async function jugar(matchup: string, kills: [number, number], topChampion: string) {
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
      cruce.get(matchup),
    ])
    partida.set(matchup, matchId)
    return matchId
  }

  async function fallo(matchup: string, winner: string | null, ruling = 'alineacion_indebida') {
    const { rows } = await db.query<{ set_fixture_ruling: Resultado }>(
      'select public.set_fixture_ruling($1, $2, $3)',
      [cruce.get(matchup), winner ? team.get(winner) : null, ruling],
    )
    return rows[0].set_fixture_ruling
  }

  async function tabla(): Promise<Map<string, StandingRow>> {
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
      await jugar('Equipo 06 vs Equipo 17', [23, 25], 'Camille')

      const rows = await tabla()
      expect(rows.get('Equipo 17')).toMatchObject({ wins: 1, losses: 0 })
      expect(rows.get('Equipo 06')).toMatchObject({ wins: 0, losses: 1 })
    })

    it('after it, the win changes hands and each side has played ONE game', async () => {
      await jugar('Equipo 06 vs Equipo 17', [23, 25], 'Camille')
      const result = await fallo('Equipo 06 vs Equipo 17', 'Equipo 06')

      expect(result).toMatchObject({
        ok: true,
        winner: 'Equipo 06',
        sanctioned: 'Equipo 17',
        annulled_match: true,
      })

      const rows = await tabla()
      // Not two games each: the played result is gone, not added to.
      expect(rows.get('Equipo 06')).toMatchObject({ games: 1, wins: 1, losses: 0 })
      expect(rows.get('Equipo 17')).toMatchObject({ games: 1, wins: 0, losses: 1 })
    })

    it('carries no kills from the annulled match', async () => {
      await jugar('Equipo 06 vs Equipo 17', [23, 25], 'Camille')
      await fallo('Equipo 06 vs Equipo 17', 'Equipo 06')

      const rows = await tabla()
      expect(rows.get('Equipo 06')?.kill_diff).toBe(0)
      expect(rows.get('Equipo 17')?.kill_diff).toBe(0)
    })

    it('counts the ruling for the head to head, against the kill difference', async () => {
      /*
       * 06 and 17 end level on 1-1. 17 routed 11 and 06 was routed by 14, so
       * on kill difference 17 is far ahead. The game between them - the one
       * the organizers gave to 06 - is what puts 06 above.
       */
      await jugar('Equipo 06 vs Equipo 17', [23, 25], 'Camille')
      await jugar('Equipo 17 vs Equipo 11', [30, 2], 'Garen')
      await jugar('Equipo 06 vs Equipo 14', [2, 30], 'Darius')
      await fallo('Equipo 06 vs Equipo 17', 'Equipo 06')

      const rows = await tabla()
      const seis = rows.get('Equipo 06')!
      const diecisiete = rows.get('Equipo 17')!

      expect([seis.wins, seis.losses]).toEqual([1, 1])
      expect([diecisiete.wins, diecisiete.losses]).toEqual([1, 1])
      expect(diecisiete.kill_diff).toBeGreaterThan(seis.kill_diff)
      expect(seis.position).toBeLessThan(diecisiete.position)
    })
  })

  describe('the fixture', () => {
    it('names the ruling instead of a scoreline', async () => {
      await jugar('Equipo 06 vs Equipo 17', [23, 25], 'Camille')
      await fallo('Equipo 06 vs Equipo 17', 'Equipo 06')

      const { rows } = await db.query(
        `select status, winner_team_id, team_a_win, team_b_win, team_a_kills, team_b_kills,
                ruling, match_id, walkover_team_id
           from public.fixture_results where id = $1`,
        [cruce.get('Equipo 06 vs Equipo 17')],
      )

      expect(rows[0]).toMatchObject({
        status: 'reglamento',
        winner_team_id: team.get('Equipo 06'),
        team_a_win: true,
        team_b_win: false,
        // The 23-25 is not a result any more, so it is not drawn as one.
        team_a_kills: null,
        team_b_kills: null,
        ruling: 'alineacion_indebida',
        // It is still the match that was played: nothing got unhooked.
        match_id: partida.get('Equipo 06 vs Equipo 17'),
        walkover_team_id: null,
      })
    })
  })

  describe('the statistics', () => {
    /*
     * One check per aggregate, by name. The two bases cover most of them, but
     * four read `matches` directly, and a leak in any one of those is a number
     * on the site built from a match that does not count.
     */
    beforeEach(async () => {
      await jugar('Equipo 06 vs Equipo 17', [23, 25], 'Camille')
      await jugar('Equipo 11 vs Equipo 14', [10, 12], 'Garen')
      await fallo('Equipo 06 vs Equipo 17', 'Equipo 06')
    })

    const annulled = () => partida.get('Equipo 06 vs Equipo 17')

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
      // A champion that was only ever played in that match is nowhere in the meta.
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
      const fair = partida.get('Equipo 11 vs Equipo 14')

      expect(
        await count(`select count(*) as n from public.player_match_stats where match_id = $1`, [fair]),
      ).toBe(10)
      expect(
        await count(`select count(*) as n from public.match_records where match_id = $1`, [fair]),
      ).toBe(1)
    })

    it('keeps the scoreboard and the match in the listing, marked', async () => {
      // The evidence of what was sanctioned stays: only the counting stops.
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
      await jugar('Equipo 06 vs Equipo 17', [23, 25], 'Camille')
      await fallo('Equipo 06 vs Equipo 17', 'Equipo 06')
      const result = await fallo('Equipo 06 vs Equipo 17', null)

      expect(result).toMatchObject({ ok: true, cleared: true })

      const rows = await tabla()
      expect(rows.get('Equipo 17')).toMatchObject({ games: 1, wins: 1, losses: 0 })
      expect(
        await count(`select count(*) as n from public.champion_meta where champion = 'Camille'`),
      ).toBeGreaterThan(0)
    })
  })

  describe('what it refuses', () => {
    it('a team that does not play the matchup', async () => {
      await jugar('Equipo 06 vs Equipo 17', [23, 25], 'Camille')
      const result = await fallo('Equipo 06 vs Equipo 17', 'Equipo 11')

      expect(result).toMatchObject({ ok: false, error: 'Ese equipo no juega este cruce.' })
    })

    it('a reason the site has no name for', async () => {
      await jugar('Equipo 06 vs Equipo 17', [23, 25], 'Camille')
      const result = await fallo('Equipo 06 vs Equipo 17', 'Equipo 06', 'porque si')

      expect(result).toMatchObject({ ok: false, error: 'Ese motivo no existe.' })
    })

    it('a matchup already awarded as a walkover', async () => {
      await db.query(`update public.fixtures set walkover_team_id = $1 where id = $2`, [
        team.get('Equipo 11'),
        cruce.get('Equipo 11 vs Equipo 14'),
      ])
      const result = await fallo('Equipo 11 vs Equipo 14', 'Equipo 14')

      expect(result.ok).toBe(false)
    })

    it('a walkover and a ruling on the same matchup, even written by hand', async () => {
      await expect(
        db.query(
          `update public.fixtures
              set walkover_team_id = team_a_id, ruling_winner_team_id = team_b_id,
                  ruling = 'alineacion_indebida'
            where id = $1`,
          [cruce.get('Equipo 11 vs Equipo 14')],
        ),
      ).rejects.toThrow(/fixtures_ruling_or_walkover/)
    })

    it('anon cannot execute it', async () => {
      await db.exec('set role anon')
      try {
        await expect(
          db.query(`select public.set_fixture_ruling($1, null)`, [cruce.get('Equipo 06 vs Equipo 17')]),
        ).rejects.toThrow(/permission denied|permiso denegado/i)
      } finally {
        await db.exec('reset role')
      }
    })
  })
})
