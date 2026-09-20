import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb } from './helpers/db'
import { playScoreboard } from './helpers/matches'

/*
 * Getting a playoff result into the site (0033).
 *
 * The bracket advances itself once a match carries its `series_id`, so this is
 * the one link in the chain a person makes. Nothing downstream checks it: a
 * match on the wrong series hands someone else the round, and a missing one
 * leaves the bracket stuck. It runs while the tournament is live and nobody is
 * watching the code, which is why it is tested end to end here rather than by
 * its parts.
 */

interface Answer {
  ok: boolean
  error?: string
  blue_team_id?: string
  learned?: number
}

interface SeriesRow {
  round: string
  wins_a: number
  wins_b: number
  winner: string | null
  status: string
  team_a: string | null
  team_b: string | null
}

describe('a playoff match', () => {
  let db: PGlite
  let tournamentId: string
  const team = new Map<string, string>()
  const series = new Map<string, string>()

  /** A scoreboard of five for one side. */
  const five = (prefix: string) =>
    [1, 2, 3, 4, 5].map((n) => ({ puuid: `${prefix}-${n}`, position: 'MIDDLE' }))

  async function assign(
    matchId: string,
    seriesId: string,
    blue?: string,
    game?: number,
  ): Promise<Answer> {
    const { rows } = await db.query<{ result: Answer }>(
      'select public.assign_match_to_series($1, $2, $3, $4) as result',
      [matchId, seriesId, blue ?? null, game ?? null],
    )
    return rows[0].result
  }

  /** A replay of the series' two teams, not yet filed. */
  async function replay(winner: 'blue' | 'red' = 'blue') {
    return playScoreboard(db, {
      tournamentId,
      blueTeamId: team.get('Equipo 01'),
      redTeamId: team.get('Equipo 15'),
      winner,
      blue: five('Equipo 01'),
      red: five('Equipo 15'),
    })
  }

  async function award(seriesKey: string, teamName: string | null): Promise<Answer> {
    const { rows } = await db.query<{ result: Answer }>(
      'select public.set_series_walkover($1, $2) as result',
      [series.get(seriesKey), teamName ? team.get(teamName) : null],
    )
    return rows[0].result
  }

  /** One game of a series, by its key, with `winner` taking it. */
  async function play(key: string, blue: string, red: string, winner: 'blue' | 'red') {
    const matchId = await playScoreboard(db, {
      tournamentId,
      blueTeamId: team.get(blue),
      redTeamId: team.get(red),
      winner,
      blue: five(blue),
      red: five(red),
    })
    const answer = await assign(matchId, series.get(key)!, team.get(blue))
    expect(answer.ok).toBe(true)
    return matchId
  }

  async function bracket(): Promise<SeriesRow[]> {
    const { rows } = await db.query<SeriesRow>(
      `select round, wins_a, wins_b, status,
              winner_team_id as winner, team_a_name as team_a, team_b_name as team_b
         from public.series_results
        where tournament_id = $1 order by stage_order, order_index`,
      [tournamentId],
    )
    return rows
  }

  beforeAll(async () => {
    db = await createTestDb()

    const tournament = await db.query<{ id: string }>(
      `insert into public.tournaments (name, slug) values ('LIDE 2', 'lide-2') returning id`,
    )
    tournamentId = tournament.rows[0].id

    const stage = async (name: string, kind: string, order: number) =>
      (
        await db.query<{ id: string }>(
          `insert into public.stages (tournament_id, name, kind, order_index)
           values ($1, $2, $3, $4) returning id`,
          [tournamentId, name, kind, order],
        )
      ).rows[0].id

    const quarterStage = await stage('Cuartos de final', 'playoffs', 1)
    const semiStage = await stage('Semifinales', 'playoffs', 2)

    for (const name of ['Equipo 01', 'Equipo 15', 'Equipo 03']) {
      const { rows } = await db.query<{ id: string }>(
        `insert into public.teams (tournament_id, name, group_label)
         values ($1, $2, 'Grupo A') returning id`,
        [tournamentId, name],
      )
      team.set(name, rows[0].id)
    }

    // A semifinal the quarter-final feeds into, so the advance can be seen.
    const semi = await db.query<{ id: string }>(
      `insert into public.series (stage_id, round, best_of, order_index, slot_a_label)
       values ($1, 'Semifinales', 3, 1, 'Ganador cuartos 1') returning id`,
      [semiStage],
    )
    series.set('semi', semi.rows[0].id)

    const quarter = await db.query<{ id: string }>(
      `insert into public.series
         (stage_id, round, best_of, order_index, team_a_id, team_b_id, next_series_id, next_slot)
       values ($1, 'Cuartos de final', 3, 1, $2, $3, $4, 'a') returning id`,
      [quarterStage, team.get('Equipo 01'), team.get('Equipo 15'), semi.rows[0].id],
    )
    series.set('quarter', quarter.rows[0].id)

    // A second quarter-final with nobody drawn into it yet.
    const undrawn = await db.query<{ id: string }>(
      `insert into public.series (stage_id, round, best_of, order_index)
       values ($1, 'Cuartos de final', 3, 2) returning id`,
      [quarterStage],
    )
    series.set('undrawn', undrawn.rows[0].id)

    // One to fill game by game, and one nobody turns up to. The second feeds
    // the semifinal's other side, so the award can be seen advancing.
    for (const [key, order, slot] of [
      ['taken', 3, null],
      ['walkover', 4, 'b'],
    ] as const) {
      const { rows } = await db.query<{ id: string }>(
        `insert into public.series
           (stage_id, round, best_of, order_index, team_a_id, team_b_id, next_series_id, next_slot)
         values ($1, 'Cuartos de final', 3, $2, $3, $4, $5, $6) returning id`,
        [
          quarterStage,
          order,
          team.get('Equipo 01'),
          team.get('Equipo 15'),
          slot ? semi.rows[0].id : null,
          slot,
        ],
      )
      series.set(key, rows[0].id)
    }
  })

  afterAll(async () => db?.close())

  it('refuses a series whose teams the draw has not decided yet', async () => {
    const matchId = await playScoreboard(db, {
      tournamentId,
      blueTeamId: team.get('Equipo 01'),
      redTeamId: team.get('Equipo 15'),
      winner: 'blue',
      blue: five('Equipo 01'),
      red: five('Equipo 15'),
    })

    const answer = await assign(matchId, series.get('undrawn')!)

    expect(answer.ok).toBe(false)
    expect(answer.error).toContain('/admin/cruces')
  })

  it('refuses a team that does not play the series', async () => {
    const matchId = await playScoreboard(db, {
      tournamentId,
      blueTeamId: team.get('Equipo 03'),
      redTeamId: team.get('Equipo 15'),
      winner: 'blue',
      blue: five('Equipo 03'),
      red: five('Equipo 15'),
    })

    const answer = await assign(matchId, series.get('quarter')!, team.get('Equipo 03'))

    expect(answer.ok).toBe(false)
    expect(answer.error).toContain('no juega esta serie')
  })

  it('counts the games and carries the winner into the next round', async () => {
    await play('quarter', 'Equipo 01', 'Equipo 15', 'blue')

    let rounds = await bracket()
    let quarter = rounds.find((row) => row.round === 'Cuartos de final' && row.team_a)!

    // One of three: the series is under way, not decided.
    expect(Number(quarter.wins_a)).toBe(1)
    expect(quarter.status).toBe('playing')
    expect(quarter.winner).toBeNull()
    expect(rounds.find((row) => row.round === 'Semifinales')!.team_a).toBeNull()

    // The second win closes a BO3.
    await play('quarter', 'Equipo 15', 'Equipo 01', 'red')

    rounds = await bracket()
    quarter = rounds.find((row) => row.round === 'Cuartos de final' && row.team_a)!

    expect(Number(quarter.wins_a)).toBe(2)
    expect(quarter.status).toBe('finished')
    expect(quarter.winner).toBe(team.get('Equipo 01'))

    // Nobody typed this in: the trigger moved the winner along.
    expect(rounds.find((row) => row.round === 'Semifinales')!.team_a).toBe('Equipo 01')
  })

  /* The match is placed now, so the panel should stop offering it. */
  it('leaves the queue once it is assigned', async () => {
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from public.unassigned_matches
        where match_id in (select id from public.matches where series_id = $1)`,
      [series.get('quarter')],
    )

    expect(rows[0].n).toBe(0)
  })

  it('reaches the stats as a playoff match, under its round', async () => {
    const { rows } = await db.query<{ phase: string; round_label: string; n: number }>(
      `select phase, round_label, count(*)::int as n
         from public.match_context
        where tournament_id = $1 and phase = 'playoffs'
        group by phase, round_label`,
      [tournamentId],
    )

    expect(rows).toHaveLength(1)
    expect(rows[0].round_label).toBe('Cuartos de final')
    expect(rows[0].n).toBe(2)
  })

  describe('its place in the series', () => {
    /* A BO3 is three games; asking for a fourth is a slip of the select. */
    it('refuses a game number outside the best-of', () => {
      return replay().then(async (matchId) => {
        const answer = await assign(matchId, series.get('quarter')!, team.get('Equipo 01'), 4)

        expect(answer.ok).toBe(false)
        expect(answer.error).toContain('BO3')
      })
    })

    /*
     * Two replays claiming the same game are a duplicate or the wrong series,
     * and either one changes who advances.
     */
    it('refuses a game the series already has', async () => {
      const first = await replay()
      expect((await assign(first, series.get('taken')!, team.get('Equipo 01'), 1)).ok).toBe(true)

      const again = await replay('red')
      const answer = await assign(again, series.get('taken')!, team.get('Equipo 01'), 1)

      expect(answer.ok).toBe(false)
      expect(answer.error).toContain('ya esta cargada')
    })

    it('records the number it was given', async () => {
      const matchId = await replay()
      expect((await assign(matchId, series.get('taken')!, team.get('Equipo 01'), 2)).ok).toBe(true)

      const { rows } = await db.query<{ game_number: number }>(
        'select game_number from public.matches where id = $1',
        [matchId],
      )
      expect(rows[0].game_number).toBe(2)
    })
  })

  describe('a series nobody played', () => {
    it('goes to the team that turned up, with no games', async () => {
      expect((await award('walkover', 'Equipo 01')).ok).toBe(true)

      const row = (await bracket()).find((entry) => entry.round === 'Cuartos de final' && entry.status === 'w.o.')

      expect(row?.winner).toBe(team.get('Equipo 01'))
      // The point of an award: it is not a 2-0, it is no games at all.
      expect(Number(row?.wins_a)).toBe(0)
      expect(Number(row?.wins_b)).toBe(0)
    })

    it('carries that team into the next round, like a played one', async () => {
      const semi = (await bracket()).find((entry) => entry.round === 'Semifinales' && entry.team_b)

      expect(semi?.team_b).toBe('Equipo 01')
    })

    it('refuses to award a series that has games', async () => {
      const answer = await award('taken', 'Equipo 01')

      expect(answer.ok).toBe(false)
      expect(answer.error).toContain('partidas cargadas')
    })

    it('refuses a replay while the award stands', async () => {
      const matchId = await replay()
      const answer = await assign(matchId, series.get('walkover')!, team.get('Equipo 01'), 1)

      expect(answer.ok).toBe(false)
      expect(answer.error).toContain('no presentada')
    })

    /* Taking it back leaves the series open again, not decided for nobody. */
    it('can be undone', async () => {
      expect((await award('walkover', null)).ok).toBe(true)

      const row = (await bracket()).find((entry) => entry.round === 'Cuartos de final' && entry.status === 'pending')

      expect(row?.winner).toBeNull()
    })
  })

  /* Three games is a whole BO3; a fourth would be the same replay twice. */
  it('refuses more games than the series can have', async () => {
    const extra = await playScoreboard(db, {
      tournamentId,
      blueTeamId: team.get('Equipo 01'),
      redTeamId: team.get('Equipo 15'),
      winner: 'blue',
      blue: five('Equipo 01'),
      red: five('Equipo 15'),
    })

    await assign(extra, series.get('quarter')!, team.get('Equipo 01'))
    const fourth = await playScoreboard(db, {
      tournamentId,
      blueTeamId: team.get('Equipo 01'),
      redTeamId: team.get('Equipo 15'),
      winner: 'blue',
      blue: five('Equipo 01'),
      red: five('Equipo 15'),
    })

    const answer = await assign(fourth, series.get('quarter')!, team.get('Equipo 01'))

    expect(answer.ok).toBe(false)
    expect(answer.error).toContain('BO3')
  })
})
