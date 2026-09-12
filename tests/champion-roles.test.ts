import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { createTestDb } from './helpers/db'
import { playScoreboard } from './helpers/matches'

/**
 * A champion gets played in more than one role, and the views have to say all
 * of them.
 *
 * `position` is a `mode()`: the lane the champion was played in MOST. With it
 * alone, a Camille picked twice top and once support reads as a top laner and
 * nothing else - and since that same column is what the role filter compares
 * against, asking for supports hid a champion that had been played there.
 *
 * The shape here is deliberately lopsided. Camille goes top twice and support
 * once, so `position` and `positions` cannot come out equal by accident: the
 * mode has one value and the list has two, and a view that got this wrong in
 * either direction fails.
 */

interface RolesRow {
  champion: string
  position: string | null
  positions: string[]
  picks: number
}

/** What a role row has to answer, beyond naming the role. */
interface ScopedRow {
  wins: number
  win_pct: number | null
  kda: number
  avg_kda: number
  bans: number | null
  ban_rate: number | null
  presence: number | null
  pick_rate: number | null
  matches: number
}

const RED = ['Darius', 'Zed', 'Orianna', 'Caitlyn', 'Leona']

describe('the roles a champion was played in', () => {
  let db: PGlite
  let tournamentId: string

  /** Camille goes wherever the match says; the other four hold their lane. */
  async function play(camilleAt: string, matchday: number): Promise<void> {
    const blue = ['Camille', 'Ahri', 'Lux', 'Jinx', 'Thresh']
    const lanes = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'SUPPORT']

    const matchId = await playScoreboard(db, {
      tournamentId,
      blueTeamId: team.get('A1'),
      redTeamId: team.get('A2'),
      winner: 'blue',
      blue: blue.map((champion, i) => ({
        puuid: `azul-${i}`,
        champion,
        // Camille takes the lane under test and the one she displaces steps
        // into hers, so the five lanes are always covered exactly once.
        position: i === 0 ? camilleAt : camilleAt === lanes[i] ? 'TOP' : lanes[i],
        kills: 3,
      })),
      red: RED.map((champion, i) => ({
        puuid: `rojo-${i}`,
        champion,
        position: lanes[i],
        deaths: 3,
      })),
      playedAt: `2026-09-0${4 + matchday}T17:00:00Z`,
    })

    await db.query(
      `insert into public.fixtures
         (tournament_id, stage_id, group_label, matchday, slot, kickoff,
          team_a_id, team_b_id, match_id)
       values ($1, $2, 'Grupo A', $3, 1, now(), $4, $5, $6)`,
      [tournamentId, stageId, matchday, team.get('A1'), team.get('A2'), matchId],
    )
  }

  const team = new Map<string, string>()
  let stageId: string

  beforeAll(async () => {
    db = await createTestDb()

    const tournament = await db.query<{ id: string }>(
      `insert into public.tournaments (name, slug, format)
       values ('LIDE 2', 'lide-2', 'grupos') returning id`,
    )
    tournamentId = tournament.rows[0].id

    const stage = await db.query<{ id: string }>(
      `insert into public.stages (tournament_id, name, kind, order_index)
       values ($1, 'Grupo A', 'grupos', 0) returning id`,
      [tournamentId],
    )
    stageId = stage.rows[0].id

    for (const name of ['A1', 'A2']) {
      const { rows } = await db.query<{ id: string }>(
        `insert into public.teams (tournament_id, name, group_label)
         values ($1, $2, 'Grupo A') returning id`,
        [tournamentId, name],
      )
      team.set(name, rows[0].id)
    }

    // Twice top, once support.
    await play('TOP', 1)
    await play('TOP', 2)
    await play('SUPPORT', 3)
  }, 60_000)

  /** The champion whole, in the accumulated scope of each view. */
  async function row(view: 'champion_meta' | 'champion_stats', champion: string) {
    const total =
      view === 'champion_meta'
        ? 'all_groups and all_matchdays and all_roles'
        : 'is_total'

    const { rows } = await db.query<RolesRow>(
      `select champion, position, positions, picks
         from public.${view}
        where tournament_id = $1 and phase = 'grupos' and ${total} and champion = $2`,
      [tournamentId, champion],
    )
    return rows[0]
  }

  /** The champion in ONE role, which is what a filtered table draws. */
  async function inRole(champion: string, role: string) {
    const { rows } = await db.query<RolesRow & ScopedRow>(
      `select champion, position, positions, picks, wins, win_pct, kda, avg_kda,
              bans, ban_rate, presence, pick_rate, matches
         from public.champion_meta
        where tournament_id = $1 and phase = 'grupos'
          and all_groups and all_matchdays and not all_roles
          and champion = $2 and position = $3`,
      [tournamentId, champion, role],
    )
    return rows[0]
  }

  for (const view of ['champion_meta', 'champion_stats'] as const) {
    describe(view, () => {
      it('keeps the commonest role in `position`', async () => {
        const camille = await row(view, 'Camille')

        expect(camille.picks).toBe(3)
        expect(camille.position).toBe('TOP')
      })

      it('lists every role it was played in', async () => {
        const camille = await row(view, 'Camille')

        expect([...camille.positions].sort()).toEqual(['SUPPORT', 'TOP'])
      })

      it('gives a one-lane champion a list of one', async () => {
        const ahri = await row(view, 'Ahri')

        expect(ahri.position).toBe('JUNGLE')
        expect(ahri.positions).toEqual(['JUNGLE'])
      })

      it('does not repeat a role played many times', async () => {
        // Thresh held support in the two matches Camille did not take it.
        const thresh = await row(view, 'Thresh')

        expect(thresh.picks).toBe(3)
        expect(thresh.positions).toHaveLength(2)
      })
    })
  }

  describe('the stats of one role', () => {
    /*
     * This is the half that 0029 was missing. Showing "Top, Soporte" beside a
     * champion and then handing over the numbers of all three picks means the
     * filter promises a role and delivers the whole champion.
     *
     * Camille's support pick is one game; her top picks are two. Any column
     * that comes back with three behind it has not been split.
     */
    it('counts only the picks of that role', async () => {
      const whole = await row('champion_meta', 'Camille')
      const support = await inRole('Camille', 'SUPPORT')
      const top = await inRole('Camille', 'TOP')

      expect(whole.picks).toBe(3)
      expect(support.picks).toBe(1)
      expect(top.picks).toBe(2)
    })

    it('names the role it is about, and only that one', async () => {
      const support = await inRole('Camille', 'SUPPORT')

      expect(support.position).toBe('SUPPORT')
      expect(support.positions).toEqual(['SUPPORT'])
    })

    it('splits the averages too, which is what could not be done afterwards', async () => {
      // An average cannot be taken apart once it is taken: there is no way to
      // get the support row out of the champion's row, which is why the role
      // had to become a dimension of the view.
      const support = await inRole('Camille', 'SUPPORT')

      expect(Number(support.win_pct)).toBe(1)
      expect(Number(support.wins)).toBe(1)
      expect(Number(support.avg_kda)).toBeGreaterThan(0)
    })

    it('keeps the scope size, so a rate still has a denominator', async () => {
      const support = await inRole('Camille', 'SUPPORT')

      // Three matches were played; Camille went support in one of them.
      expect(Number(support.matches)).toBe(3)
      expect(Number(support.pick_rate)).toBeCloseTo(1 / 3, 2)
    })

    it('leaves the bans empty, because a ban has no role', async () => {
      // Not zero: nobody banned "Camille support", the question does not exist.
      const support = await inRole('Camille', 'SUPPORT')

      expect(support.bans).toBeNull()
      expect(support.ban_rate).toBeNull()
      expect(support.presence).toBeNull()
    })

    it('has no row for a role the champion never played', async () => {
      expect(await inRole('Camille', 'JUNGLE')).toBeUndefined()
    })

    it('adds its roles back up to the champion whole', async () => {
      const whole = await row('champion_meta', 'Camille')
      const parts = await Promise.all(
        ['TOP', 'SUPPORT'].map((role) => inRole('Camille', role)),
      )

      expect(parts.reduce((total, part) => total + Number(part.picks), 0)).toBe(whole.picks)
    })
  })
})

