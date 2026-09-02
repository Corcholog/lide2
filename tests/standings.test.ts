import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb } from './helpers/db'
import { playMatch } from './helpers/matches'

/** One fixture matchup, in the tournament's terms. */
interface Played {
  blue: string
  red: string
  winner: 'blue' | 'red'
  blueKills: number
  redKills: number
  stage: string
  round: string
  playedAt: string
}

async function play(db: PGlite, teams: Map<string, string>, game: Played): Promise<void> {
  await playMatch(db, {
    blueTeamId: teams.get(game.blue),
    redTeamId: teams.get(game.red),
    winner: game.winner,
    blueKills: game.blueKills,
    redKills: game.redKills,
    stageLabel: game.stage,
    roundLabel: game.round,
    playedAt: game.playedAt,
  })
}

interface StandingRow {
  team_name: string
  games: number
  wins: number
  losses: number
  kill_diff: string
  position: number
  form: boolean[]
}

describe('standings table', () => {
  let db: PGlite

  beforeAll(async () => {
    db = await createTestDb()

    const teams = new Map<string, string>()
    for (const name of ['Alfa', 'Bravo', 'Charlie', 'Delta', 'Eco', 'Fox']) {
      const { rows } = await db.query<{ id: string }>(
        'insert into public.teams (name) values ($1) returning id',
        [name],
      )
      teams.set(name, rows[0].id)
    }

    const fixture: Played[] = [
      // Block A, matchday 1
      { blue: 'Alfa', red: 'Bravo', winner: 'blue', blueKills: 20, redKills: 10, stage: 'Bloque A', round: 'Fecha 1', playedAt: '2026-05-16T22:00:00Z' },
      { blue: 'Charlie', red: 'Delta', winner: 'blue', blueKills: 15, redKills: 12, stage: 'Bloque A', round: 'Fecha 1', playedAt: '2026-05-16T22:00:00Z' },
      // Block A, matchday 2
      { blue: 'Alfa', red: 'Charlie', winner: 'red', blueKills: 14, redKills: 18, stage: 'Bloque A', round: 'Fecha 2', playedAt: '2026-05-23T22:00:00Z' },
      { blue: 'Bravo', red: 'Delta', winner: 'blue', blueKills: 25, redKills: 5, stage: 'Bloque A', round: 'Fecha 2', playedAt: '2026-05-23T22:00:00Z' },
      // Another block: it has its own table
      { blue: 'Eco', red: 'Fox', winner: 'blue', blueKills: 11, redKills: 9, stage: 'Bloque B', round: 'Fecha 1', playedAt: '2026-05-16T22:00:00Z' },
    ]

    for (const game of fixture) await play(db, teams, game)

    // A team's match against opponents with no roster loaded: it does not count.
    await db.query(
      `insert into public.matches
         (fingerprint, format, game_length_ms, played_at, winning_side, blue_team_id,
          stage_label, round_label, raw_metadata)
       values ('fp-suelta', 'CLASSIC', 1800000, '2026-05-30T22:00:00Z', 100, $1,
               'Bloque A', 'Fecha 3', '{}'::jsonb)`,
      [teams.get('Delta')],
    )
  }, 60_000)

  afterAll(async () => {
    await db?.close()
  })

  it('turns each match into two team/opponent rows', async () => {
    const { rows } = await db.query<{ n: string }>(
      'select count(*) as n from public.team_match_results',
    )
    // 5 matches with both teams linked, plus the loose side of the sixth.
    expect(Number(rows[0].n)).toBe(11)

    const alfa = await db.query<{ opponent_name: string; win: boolean; kills: string }>(
      `select opponent_name, win, kills::text from public.team_match_results
        where team_name = 'Alfa' order by played_at`,
    )
    expect(alfa.rows.map((r) => [r.opponent_name, r.win])).toEqual([
      ['Bravo', true],
      ['Charlie', false],
    ])
    expect(alfa.rows.map((r) => Number(r.kills))).toEqual([20, 14])
  })

  it('orders by wins and breaks ties on kill difference', async () => {
    const { rows } = await db.query<StandingRow>(
      `select team_name, games, wins, losses, kill_diff::text, position, form
         from public.team_standings where stage_label = 'Bloque A' order by position`,
    )

    expect(rows.map((r) => r.team_name)).toEqual(['Charlie', 'Bravo', 'Alfa', 'Delta'])
    expect(rows.map((r) => r.wins)).toEqual([2, 1, 1, 0])

    // Bravo and Alfa are level at 1-1: Bravo goes through on difference (+10 against +6).
    const [, bravo, alfa] = rows
    expect(Number(bravo.kill_diff)).toBe(10)
    expect(Number(alfa.kill_diff)).toBe(6)
  })

  it('each stage has its own table', async () => {
    const { rows } = await db.query<StandingRow>(
      `select team_name, wins, position from public.team_standings
        where stage_label = 'Bloque B' order by position`,
    )
    expect(rows.map((r) => [r.team_name, r.position])).toEqual([
      ['Eco', 1],
      ['Fox', 2],
    ])
  })

  it('does not count matches where the opponent is not linked yet', async () => {
    const { rows } = await db.query<StandingRow>(
      `select games, wins, losses from public.team_standings where team_name = 'Delta'`,
    )
    expect(rows[0].games).toBe(2)
    expect(rows[0].losses).toBe(2)
  })

  it('leaves the last results ready for the form streak', async () => {
    const { rows } = await db.query<StandingRow>(
      `select form from public.team_standings where team_name = 'Alfa'`,
    )
    // Newest first: they lost to Charlie, before that they beat Bravo.
    expect(rows[0].form).toEqual([false, true])
  })
})
