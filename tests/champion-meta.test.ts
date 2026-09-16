import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { createTestDb } from './helpers/db'
import { playScoreboard } from './helpers/matches'

/**
 * `champion_meta`: the champion stats with the group dimension
 * (0021_meta_y_bans.sql).
 *
 * Two groups of two teams over two matchdays (four matches), the minimum for
 * the four scopes to give different numbers; otherwise the test could pass with
 * the view ignoring the group. Matches are linked to fixture matchups, which is
 * how `match_context` resolves the group in production.
 */

const BLUE = ['b-top', 'b-jgl', 'b-mid', 'b-adc', 'b-sup']
const RED = ['r-top', 'r-jgl', 'r-mid', 'r-adc', 'r-sup']

/** Blue side picks for group A. Ahri plays mid and is the focus of most tests. */
const BLUE_PICKS_A = ['Garen', 'Ahri', 'Lux', 'Jinx', 'Thresh']
/** Group B plays Yasuo instead, so Ahri only appears in group A. */
const BLUE_PICKS_B = ['Garen', 'Yasuo', 'Lux', 'Jinx', 'Thresh']
const RED_PICKS = ['Darius', 'Zed', 'Orianna', 'Caitlyn', 'Leona']

interface MetaRow {
  champion: string
  group_label: string | null
  matchday: number | null
  all_groups: boolean
  all_matchdays: boolean
  picks: number
  wins: number
  win_pct: number | null
  bans: number
  matches: number
  matches_with_bans: number
  pick_rate: number | null
  ban_rate: number | null
  presence: number | null
  kda: number
  avg_kda: number
  dpm: number
}

describe('champion meta', () => {
  let db: PGlite
  let tournamentId: string
  const team = new Map<string, string>()

/** The requested scope, built like `metaFilter` does in the app. */
  async function meta(
    groupLabel: string | null,
    matchday: number | null,
    champion?: string,
  ): Promise<MetaRow[]> {
    const { rows } = await db.query<MetaRow>(
      `select * from public.champion_meta
        where tournament_id = $1
          and phase = 'grupos'
          -- The champion whole, which is the only thing this view returned
          -- before 0030 gave it a role dimension. What the per-role rows say is
          -- checked in champion-roles.test.ts; here they would be noise, and
          -- without this line every scope would come back doubled.
          and all_roles
          and all_groups = $2
          and group_label is not distinct from $3
          and all_matchdays = $4
          and matchday is not distinct from $5
          and ($6::text is null or champion = $6)
        order by champion`,
      [
        tournamentId,
        groupLabel === null,
        groupLabel,
        matchday === null,
        matchday,
        champion ?? null,
      ],
    )
    return rows
  }

  beforeAll(async () => {
    db = await createTestDb()

    const tournament = await db.query<{ id: string }>(
      `insert into public.tournaments (name, slug, format)
       values ('LIDE 2', 'lide-2', 'grupos') returning id`,
    )
    tournamentId = tournament.rows[0].id

    const stage = new Map<string, string>()
    for (const [index, groupLabel] of ['Grupo A', 'Grupo B'].entries()) {
      const { rows } = await db.query<{ id: string }>(
        `insert into public.stages (tournament_id, name, kind, order_index)
         values ($1, $2, 'grupos', $3) returning id`,
        [tournamentId, groupLabel, index],
      )
      stage.set(groupLabel, rows[0].id)
    }

    for (const [name, groupLabel] of [
      ['A1', 'Grupo A'],
      ['A2', 'Grupo A'],
      ['B1', 'Grupo B'],
      ['B2', 'Grupo B'],
    ]) {
      const { rows } = await db.query<{ id: string }>(
        `insert into public.teams (tournament_id, name, group_label)
         values ($1, $2, $3) returning id`,
        [tournamentId, name, groupLabel],
      )
      team.set(name, rows[0].id)
    }

    // Four matches: each group plays its matchup on both matchdays.
    for (const matchday of [1, 2]) {
      for (const [groupLabel, home, away, bluePicks] of [
        ['Grupo A', 'A1', 'A2', BLUE_PICKS_A],
        ['Grupo B', 'B1', 'B2', BLUE_PICKS_B],
      ] as const) {
        const matchId = await playScoreboard(db, {
          tournamentId,
          blueTeamId: team.get(home),
          redTeamId: team.get(away),
          winner: 'blue',
          blue: BLUE.map((puuid, i) => ({
            puuid: `${groupLabel}-${puuid}`,
            champion: bluePicks[i],
            kills: 3,
          })),
          red: RED.map((puuid, i) => ({
            puuid: `${groupLabel}-${puuid}`,
            champion: RED_PICKS[i],
            deaths: 3,
          })),
        })

        await db.query(
          `insert into public.fixtures
             (tournament_id, stage_id, group_label, matchday, slot, kickoff,
              team_a_id, team_b_id, match_id)
           values ($1, $2, $3, $4, 1, now(), $5, $6, $7)`,
          [
            tournamentId,
            stage.get(groupLabel),
            groupLabel,
            matchday,
            team.get(home),
            team.get(away),
            matchId,
          ],
        )
      }
    }
  })

  it('the accumulated total counts all four matches', async () => {
    const [garen] = await meta(null, null, 'Garen')
    // Garen is played in all four, once per match.
    expect(garen.matches).toBe(4)
    expect(garen.picks).toBe(4)
  })

  it("by matchday it counts only that matchday's two", async () => {
    const [garen] = await meta(null, 1, 'Garen')
    expect(garen.matches).toBe(2)
    expect(garen.picks).toBe(2)
  })

  it('the group scope separates what each one played', async () => {
    // Ahri is only played in group A.
    const inA = await meta('Grupo A', null, 'Ahri')
    const inB = await meta('Grupo B', null, 'Ahri')

    expect(inA).toHaveLength(1)
    expect(inA[0].picks).toBe(2)
    expect(inB).toHaveLength(0)
  })

  it('group plus matchday is the intersection of the two', async () => {
    const [ahri] = await meta('Grupo A', 1, 'Ahri')
    expect(ahri.matches).toBe(1)
    expect(ahri.picks).toBe(1)
  })

  it("pick_rate uses the scope's denominator and not the tournament's", async () => {
    // The pick rate must use the scope's match count: Ahri was picked in 2 of 4
    // matches overall (0.5), but in 2 of 2 within her group (1.0).
    const [total] = await meta(null, null, 'Ahri')
    const [inGroup] = await meta('Grupo A', null, 'Ahri')

    expect(Number(total.pick_rate)).toBe(0.5)
    expect(Number(inGroup.pick_rate)).toBe(1)
  })

  it('the two flags identify the scope with no repeated rows', async () => {
    for (const [groupLabel, matchday] of [
      [null, null],
      [null, 1],
      ['Grupo A', null],
      ['Grupo A', 1],
    ] as const) {
      const found = await meta(groupLabel, matchday, 'Garen')
      expect(found).toHaveLength(1)
    }
  })

  it("win_pct comes from the scope's picks", async () => {
    // The blue side always wins, so Ahri (blue) is 2-0 and Zed (red) 0-2.
    const [ahri] = await meta(null, null, 'Ahri')
    const [zed] = await meta(null, null, 'Zed')

    expect(Number(ahri.win_pct)).toBe(1)
    expect(Number(zed.win_pct)).toBe(0)
  })

  it('the averages are taken over the picks and not over anything else', async () => {
    // Checked against `player_match_stats`, which the view aggregates, to catch a
    // sum used instead of an average or an average over the wrong rows. The four
    // matches are identical, so `kda` and `avg_kda` coincide here; the case where
    // they differ is covered in tests/stats.test.ts.
    const expected = await db.query<{ avg_kda: string; dpm: string; picks: string }>(
      `select round(avg(s.kda), 2) as avg_kda, round(avg(s.dpm)) as dpm, count(*) as picks
         from public.player_match_stats s
        where s.tournament_id = $1 and s.champion = 'Ahri'`,
      [tournamentId],
    )

    const [ahri] = await meta(null, null, 'Ahri')

    expect(Number(ahri.picks)).toBe(Number(expected.rows[0].picks))
    expect(Number(ahri.avg_kda)).toBe(Number(expected.rows[0].avg_kda))
    expect(Number(ahri.dpm)).toBe(Number(expected.rows[0].dpm))
    expect(Number(ahri.dpm)).toBeGreaterThan(0)
  })

  it('with no draft entered, ban_rate and presence are null and not 0', async () => {
    // Zero bans and "unknown" are different: without a draft, bans are unknown.
    const [garen] = await meta(null, null, 'Garen')
    expect(garen.matches_with_bans).toBe(0)
    expect(garen.ban_rate).toBeNull()
    expect(garen.presence).toBeNull()
  })

  describe('with a draft entered', () => {
    beforeAll(async () => {
      // Only group A's matchday 1 match, so coverage is partial.
      const { rows } = await db.query<{ match_id: string }>(
        `select match_id from public.match_context
          where tournament_id = $1 and group_label = 'Grupo A' and matchday = 1`,
        [tournamentId],
      )

      await db.query(
        `insert into public.match_bans (match_id, side, champion, order_index)
         values ($1, 100, 'Teemo', 1), ($1, 200, 'Ahri', 1)`,
        [rows[0].match_id],
      )
    })

    it('a champion that was only banned still appears', async () => {
      // Teemo was never played; without the union of picks and bans in the view
      // he would not appear at all.
      const [teemo] = await meta(null, null, 'Teemo')
      expect(teemo).toBeDefined()
      expect(teemo.picks).toBe(0)
      expect(teemo.bans).toBe(1)
      expect(teemo.win_pct).toBeNull()
      // Zero, not null, unlike the rates: the table shows these as numbers, and a
      // champion never played did zero damage per minute.
      expect(Number(teemo.avg_kda)).toBe(0)
      expect(Number(teemo.dpm)).toBe(0)
    })

    it('the ban rates are measured only over the matches with a draft', async () => {
      const [teemo] = await meta(null, null, 'Teemo')
      // Four matches in the scope, but only one with its draft entered.
      expect(teemo.matches).toBe(4)
      expect(teemo.matches_with_bans).toBe(1)
      expect(Number(teemo.ban_rate)).toBe(1)
      expect(Number(teemo.presence)).toBe(1)
    })

    it('presence adds the picks from matches with a draft plus the bans', async () => {
      // Ahri was picked twice, once in a match with a draft, where she was also
      // banned by the other side.
      const [ahri] = await meta(null, null, 'Ahri')
      expect(ahri.picks).toBe(2)
      expect(ahri.bans).toBe(1)
      expect(Number(ahri.presence)).toBe(2)
    })

    it('a group with no drafts keeps its ban rates null', async () => {
      const [garen] = await meta('Grupo B', null, 'Garen')
      expect(garen.matches_with_bans).toBe(0)
      expect(garen.ban_rate).toBeNull()
      expect(garen.presence).toBeNull()
    })

    it('champion_stats did not change', async () => {
      // `champion_stats` must still return one row per champion in the total, or
      // /estadisticas and the Instagram cards would repeat champions.
      const { rows } = await db.query<{ picks: number }>(
        `select picks from public.champion_stats
          where tournament_id = $1 and phase = 'grupos' and is_total and champion = 'Garen'`,
        [tournamentId],
      )

      expect(rows).toHaveLength(1)
      expect(rows[0].picks).toBe(4)
    })
  })
})
