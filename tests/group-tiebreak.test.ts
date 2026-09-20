import type { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from './helpers/db'
import { playMatch } from './helpers/matches'

/**
 * The group table breaks ties by head to head, as the rulebook says (2.2).
 *
 * The top two places qualify, so this order is what decides who reaches the
 * bracket. Kill difference is deliberately set against the head to head in
 * these tests, so a pass cannot come from both criteria agreeing.
 */

interface Row {
  team_name: string
  wins: number
  losses: number
  kill_diff: number
  position: number
}

describe('the group table tiebreak', () => {
  let db: PGlite
  let tournamentId: string
  const team = new Map<string, string>()

  beforeEach(async () => {
    db = await createTestDb()

    const tournament = await db.query<{ id: string }>(
      `insert into public.tournaments (name, slug, format)
       values ('LIDE 2', 'lide-2', 'grupos') returning id`,
    )
    tournamentId = tournament.rows[0].id

    for (const name of ['Alfa', 'Bravo', 'Charlie', 'Delta', 'Eco']) {
      const { rows } = await db.query<{ id: string }>(
        `insert into public.teams (tournament_id, name, group_label)
         values ($1, $2, 'Grupo A') returning id`,
        [tournamentId, name],
      )
      team.set(name, rows[0].id)
    }
  }, 60_000)

  afterEach(async () => {
    team.clear()
    await db?.close()
  })

  /** A group-phase game, with the kill score that feeds the kill difference. */
  async function play(blue: string, red: string, kills: [number, number]): Promise<void> {
    await playMatch(db, {
      blueTeamId: team.get(blue),
      redTeamId: team.get(red),
      winner: kills[0] > kills[1] ? 'blue' : 'red',
      blueKills: kills[0],
      redKills: kills[1],
      stageLabel: 'Grupo A',
      roundLabel: 'Fecha 1',
      tournamentId,
    })
  }

  /** A matchup awarded because the rival did not turn up. */
  async function walkover(winner: string, absent: string): Promise<void> {
    const { rows } = await db.query<{ id: string }>(
      `insert into public.fixtures
         (tournament_id, group_label, matchday, slot, kickoff, team_a_id, team_b_id)
       values ($1, 'Grupo A', 1, 1, '2026-09-05T17:00:00Z', $2, $3) returning id`,
      [tournamentId, team.get(winner), team.get(absent)],
    )
    await db.query(`update public.fixtures set walkover_team_id = $1 where id = $2`, [
      team.get(winner),
      rows[0].id,
    ])
  }

  async function table(): Promise<Row[]> {
    const { rows } = await db.query<Row>(
      `select team_name, wins, losses, kill_diff::int as kill_diff, position
         from public.group_standings
        where tournament_id = $1 order by position, team_name`,
      [tournamentId],
    )
    return rows
  }

  it('puts the winner of the game between them first, against the kill difference', async () => {
    // Alfa beats Bravo by one kill; Bravo beats Charlie by a lot. Level at 1-1,
    // Bravo has the better kill difference, but Alfa ranks higher because it won
    // their game.
    await play('Alfa', 'Bravo', [11, 10])
    await play('Bravo', 'Charlie', [30, 2])
    await play('Charlie', 'Alfa', [20, 5])

    const rows = await table()
    const alfa = rows.find((r) => r.team_name === 'Alfa')!
    const bravo = rows.find((r) => r.team_name === 'Bravo')!

    expect([alfa.wins, alfa.losses]).toEqual([1, 1])
    expect([bravo.wins, bravo.losses]).toEqual([1, 1])
    expect(bravo.kill_diff).toBeGreaterThan(alfa.kill_diff)
    expect(alfa.position).toBeLessThan(bravo.position)
  })

  it('reads three level teams as a mini league of the games among them', async () => {
    /*
     * Alfa, Bravo and Charlie all finish 2-2. Among themselves: two wins, one and
     * none (Alfa beat both, Bravo beat Charlie), so that is the order.
     *
     * This needs five teams: with four, three level teams can only split their
     * mutual wins one each (a cycle). The kill differences run the opposite way:
     * Alfa wins its two narrowly and loses heavily to the others, Charlie the
     * reverse.
     */
    await play('Alfa', 'Bravo', [11, 10])
    await play('Alfa', 'Charlie', [11, 10])
    await play('Bravo', 'Charlie', [11, 10])
    await play('Delta', 'Alfa', [30, 1])
    await play('Eco', 'Alfa', [30, 1])
    await play('Bravo', 'Delta', [25, 2])
    await play('Eco', 'Bravo', [25, 2])
    await play('Charlie', 'Delta', [25, 2])
    await play('Charlie', 'Eco', [25, 2])
    await play('Eco', 'Delta', [20, 3])

    const rows = await table()
    const level = rows.filter((r) => r.wins === 2 && r.losses === 2)

    expect(level.map((r) => r.team_name)).toEqual(['Alfa', 'Bravo', 'Charlie'])
    // Kill difference alone would have ordered them exactly the other way.
    expect(level.map((r) => r.kill_diff)).toEqual([...level.map((r) => r.kill_diff)].sort((a, b) => a - b))
  })

  it('counts a walkover for the head to head: not turning up is losing it', async () => {
    // Bravo did not turn up against Alfa. They finish level, and the awarded game
    // separates them even though Alfa's kill difference is worse (a walkover
    // brings no kills).
    await walkover('Alfa', 'Bravo')
    await play('Bravo', 'Charlie', [30, 2])
    await play('Charlie', 'Alfa', [20, 5])

    const rows = await table()
    const alfa = rows.find((r) => r.team_name === 'Alfa')!
    const bravo = rows.find((r) => r.team_name === 'Bravo')!

    expect([alfa.wins, alfa.losses]).toEqual([1, 1])
    expect([bravo.wins, bravo.losses]).toEqual([1, 1])
    expect(alfa.kill_diff).toBeLessThan(bravo.kill_diff)
    expect(alfa.position).toBeLessThan(bravo.position)
  })

  it('still orders on points before anything else', async () => {
    // Charlie loses the game between them but wins two more: more points wins,
    // and the head to head does not apply.
    await play('Bravo', 'Charlie', [20, 5])
    await play('Charlie', 'Alfa', [11, 10])
    await play('Charlie', 'Delta', [11, 10])

    const rows = await table()

    expect(rows[0].team_name).toBe('Charlie')
    expect(rows[0].wins).toBe(2)
  })

  it('leaves teams that have played nothing level, and in a stable order', async () => {
    // Nobody has played, so there is no head to head. The view must still return
    // a stable order, or the table would reorder between refreshes.
    const first = await table()
    const again = await table()

    expect(first.map((r) => r.team_name)).toEqual(['Alfa', 'Bravo', 'Charlie', 'Delta', 'Eco'])
    expect(again.map((r) => r.team_name)).toEqual(first.map((r) => r.team_name))
  })
})
