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

  /** The champion's row in the accumulated scope of each view. */
  async function row(view: 'champion_meta' | 'champion_stats', champion: string) {
    const total =
      view === 'champion_meta'
        ? 'all_groups and all_matchdays'
        : 'is_total'

    const { rows } = await db.query<RolesRow>(
      `select champion, position, positions, picks
         from public.${view}
        where tournament_id = $1 and phase = 'grupos' and ${total} and champion = $2`,
      [tournamentId, champion],
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
})
