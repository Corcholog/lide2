import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { createTestDb } from './helpers/db'
import { playScoreboard } from './helpers/matches'

/**
 * `champion_meta`: the meta with the group dimension (0021_meta_y_bans.sql).
 *
 * TWO groups of two teams and TWO matchdays are built, that is four matches,
 * which is the minimum for the four scopes to give different numbers from each
 * other: if the total and the group's came out the same, the test would pass
 * even with the view ignoring the group.
 *
 * The matches are hooked to their fixture matchup and not to a text label,
 * which is how `match_context` resolves the group in production.
 */

const BLUE = ['b-top', 'b-jgl', 'b-mid', 'b-adc', 'b-sup']
const RED = ['r-top', 'r-jgl', 'r-mid', 'r-adc', 'r-sup']

/** The blue side's five. Ahri goes mid and is the one nearly everything looks at. */
const AZUL_A = ['Garen', 'Ahri', 'Lux', 'Jinx', 'Thresh']
/** Group B plays Yasuo where A plays Ahri: that makes Ahri exclusive to A. */
const AZUL_B = ['Garen', 'Yasuo', 'Lux', 'Jinx', 'Thresh']
const ROJO = ['Darius', 'Zed', 'Orianna', 'Caitlyn', 'Leona']

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
}

describe('champion meta', () => {
  let db: PGlite
  let tournamentId: string
  const team = new Map<string, string>()

  /** The requested scope, exactly as `metaFilter` builds it on the app side. */
  async function meta(
    grupo: string | null,
    matchday: number | null,
    champion?: string,
  ): Promise<MetaRow[]> {
    const { rows } = await db.query<MetaRow>(
      `select * from public.champion_meta
        where tournament_id = $1
          and phase = 'grupos'
          and all_groups = $2
          and group_label is not distinct from $3
          and all_matchdays = $4
          and matchday is not distinct from $5
          and ($6::text is null or champion = $6)
        order by champion`,
      [
        tournamentId,
        grupo === null,
        grupo,
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
    for (const [index, grupo] of ['Grupo A', 'Grupo B'].entries()) {
      const { rows } = await db.query<{ id: string }>(
        `insert into public.stages (tournament_id, name, kind, order_index)
         values ($1, $2, 'grupos', $3) returning id`,
        [tournamentId, grupo, index],
      )
      stage.set(grupo, rows[0].id)
    }

    for (const [name, grupo] of [
      ['A1', 'Grupo A'],
      ['A2', 'Grupo A'],
      ['B1', 'Grupo B'],
      ['B2', 'Grupo B'],
    ]) {
      const { rows } = await db.query<{ id: string }>(
        `insert into public.teams (tournament_id, name, group_label)
         values ($1, $2, $3) returning id`,
        [tournamentId, name, grupo],
      )
      team.set(name, rows[0].id)
    }

    // Four matches: each group plays its matchup on both matchdays.
    for (const matchday of [1, 2]) {
      for (const [grupo, local, visitante, azules] of [
        ['Grupo A', 'A1', 'A2', AZUL_A],
        ['Grupo B', 'B1', 'B2', AZUL_B],
      ] as const) {
        const matchId = await playScoreboard(db, {
          tournamentId,
          blueTeamId: team.get(local),
          redTeamId: team.get(visitante),
          winner: 'blue',
          blue: BLUE.map((puuid, i) => ({
            puuid: `${grupo}-${puuid}`,
            champion: azules[i],
            kills: 3,
          })),
          red: RED.map((puuid, i) => ({
            puuid: `${grupo}-${puuid}`,
            champion: ROJO[i],
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
            stage.get(grupo),
            grupo,
            matchday,
            team.get(local),
            team.get(visitante),
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
    // Ahri is exclusive to Group A: in B she does not exist.
    const enA = await meta('Grupo A', null, 'Ahri')
    const enB = await meta('Grupo B', null, 'Ahri')

    expect(enA).toHaveLength(1)
    expect(enA[0].picks).toBe(2)
    expect(enB).toHaveLength(0)
  })

  it('group plus matchday is the intersection of the two', async () => {
    const [ahri] = await meta('Grupo A', 1, 'Ahri')
    expect(ahri.matches).toBe(1)
    expect(ahri.picks).toBe(1)
  })

  it("pick_rate uses the scope's denominator and not the tournament's", async () => {
    // This is the easy mistake: scoping the picks but leaving the match total
    // whole. Ahri was played 2 times across 4 matches (0.5), but within her
    // group she was played in 2 out of 2 (1.0).
    const [total] = await meta(null, null, 'Ahri')
    const [enGrupo] = await meta('Grupo A', null, 'Ahri')

    expect(Number(total.pick_rate)).toBe(0.5)
    expect(Number(enGrupo.pick_rate)).toBe(1)
  })

  it('the two flags identify the scope with no repeated rows', async () => {
    for (const [grupo, matchday] of [
      [null, null],
      [null, 1],
      ['Grupo A', null],
      ['Grupo A', 1],
    ] as const) {
      const found = await meta(grupo, matchday, 'Garen')
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

  it('with no draft entered, ban_rate and presence are null and not 0', async () => {
    // Zero bans and "unknown" are different things: drawing them the same
    // would say a champion is never banned when in fact nobody entered the
    // draft.
    const [garen] = await meta(null, null, 'Garen')
    expect(garen.matches_with_bans).toBe(0)
    expect(garen.ban_rate).toBeNull()
    expect(garen.presence).toBeNull()
  })

  describe('with a draft entered', () => {
    beforeAll(async () => {
      // Only Group A's matchday 1 match: that leaves the coverage partial and
      // shows the denominator is not "every match".
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
      // Teemo was never played. Without the union of picks and bans in the
      // view, the meta would say he does not exist when in fact he is the most
      // respected.
      const [teemo] = await meta(null, null, 'Teemo')
      expect(teemo).toBeDefined()
      expect(teemo.picks).toBe(0)
      expect(teemo.bans).toBe(1)
      expect(teemo.win_pct).toBeNull()
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
      // Ahri was played twice, but only one was in a match with a draft; and
      // in that same match she was also banned from the other side.
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
      // The old view still returns ONE row per champion in the accumulated
      // total. If groups are ever added to it, /estadisticas and the Instagram
      // cards start repeating champions without throwing any error.
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
