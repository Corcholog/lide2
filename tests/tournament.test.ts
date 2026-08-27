import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb } from './helpers/db'
import { playMatch } from './helpers/matches'

interface StandingRow {
  team_name: string
  games: number
  wins: number
  losses: number
  kill_diff: string
  position: number
  university_tag: string | null
  form: boolean[]
}

interface SeriesRow {
  round: string
  team_a_name: string | null
  team_b_name: string | null
  wins_a: number
  wins_b: number
  games_played: number
  status: string
  winner_team_id: string | null
}

describe('estructura del torneo', () => {
  let db: PGlite
  let tournamentId: string
  let semiId: string
  const teams = new Map<string, string>()

  beforeAll(async () => {
    db = await createTestDb()

    const tournament = await db.query<{ id: string }>(
      `insert into public.tournaments (name, slug, format) values ('LIDE 2', 'lide-2', 'grupos')
       returning id`,
    )
    tournamentId = tournament.rows[0].id

    const university = await db.query<{ id: string }>(
      `insert into public.universities (name, tag) values ('Universidad de Prueba', 'UDP')
       returning id`,
    )

    for (const name of ['Alfa', 'Bravo', 'Charlie', 'Delta', 'Eco']) {
      const { rows } = await db.query<{ id: string }>(
        `insert into public.teams (tournament_id, name, group_label, university_id)
         values ($1, $2, 'Grupo A', $3) returning id`,
        [tournamentId, name, university.rows[0].id],
      )
      teams.set(name, rows[0].id)
    }

    // Bracket: dos cuartos que desembocan en la misma semifinal. La semi se crea
    // primero porque los cuartos la referencian.
    const stage = await db.query<{ id: string }>(
      `insert into public.stages (tournament_id, name, kind, order_index)
       values ($1, 'Playoffs', 'bracket', 1) returning id`,
      [tournamentId],
    )
    const stageId = stage.rows[0].id

    const semi = await db.query<{ id: string }>(
      `insert into public.series (stage_id, round, best_of, slot_a_label, slot_b_label, order_index)
       values ($1, 'Semifinales', 3, 'Ganador C1', 'Ganador C2', 1) returning id`,
      [stageId],
    )
    semiId = semi.rows[0].id

    await db.query(
      `insert into public.series
         (stage_id, round, team_a_id, team_b_id, best_of, next_series_id, next_slot, order_index)
       values ($1, 'Cuartos de final', $2, $3, 3, $4, 'a', 1),
              ($1, 'Cuartos de final', $5, $6, 3, $4, 'b', 2)`,
      [
        stageId,
        teams.get('Alfa'),
        teams.get('Bravo'),
        semiId,
        teams.get('Charlie'),
        teams.get('Delta'),
      ],
    )
  }, 60_000)

  afterAll(async () => {
    await db?.close()
  })

  it('muestra a los cinco equipos del grupo antes de que se juegue nada', async () => {
    const { rows } = await db.query<StandingRow>(
      `select team_name, games, wins, losses, position, university_tag, form
         from public.group_standings where group_label = 'Grupo A' order by position`,
    )

    expect(rows).toHaveLength(5)
    expect(rows.map((r) => r.team_name)).toEqual(['Alfa', 'Bravo', 'Charlie', 'Delta', 'Eco'])
    expect(rows.every((r) => r.games === 0 && r.wins === 0 && r.losses === 0)).toBe(true)
    expect(rows[0].form).toEqual([])
    // El nombre de la universidad viaja con la fila: la tabla se dibuja sin joins extra.
    expect(rows[0].university_tag).toBe('UDP')
  })

  it('suma las partidas de grupo y deja afuera las de playoffs', async () => {
    await playMatch(db, {
      blueTeamId: teams.get('Alfa'),
      redTeamId: teams.get('Bravo'),
      winner: 'blue',
      blueKills: 20,
      redKills: 10,
      stageLabel: 'Grupo A',
      roundLabel: 'Fecha 1',
      tournamentId,
    })
    await playMatch(db, {
      blueTeamId: teams.get('Charlie'),
      redTeamId: teams.get('Delta'),
      winner: 'blue',
      blueKills: 15,
      redKills: 12,
      stageLabel: 'Grupo A',
      roundLabel: 'Fecha 1',
      tournamentId,
    })

    const { rows } = await db.query<StandingRow>(
      `select team_name, games, wins, losses, kill_diff::text, position
         from public.group_standings where group_label = 'Grupo A' order by position`,
    )

    expect(rows.map((r) => [r.team_name, r.wins, r.losses])).toEqual([
      ['Alfa', 1, 0],
      ['Charlie', 1, 0],
      ['Eco', 0, 0],
      // Los dos perdieron una: desempata la diferencia de kills (-3 contra -10).
      ['Delta', 0, 1],
      ['Bravo', 0, 1],
    ])
    expect(Number(rows[0].kill_diff)).toBe(10)
  })

  it('el ganador de una serie aparece solo en la ronda siguiente', async () => {
    const cuartos = await db.query<{ id: string }>(
      `select id from public.series where round = 'Cuartos de final' order by order_index`,
    )
    const [q1, q2] = cuartos.rows

    // Alfa se lleva el primer cuarto 2-0: la serie cierra sin jugar el tercero.
    for (const game of [1, 2]) {
      await playMatch(db, {
        blueTeamId: teams.get('Alfa'),
        redTeamId: teams.get('Bravo'),
        winner: 'blue',
        stageLabel: 'Cuartos de final',
        tournamentId,
        seriesId: q1.id,
        gameNumber: game,
      })
    }

    // Charlie pierde el primero y se lleva los dos siguientes.
    await playMatch(db, {
      blueTeamId: teams.get('Charlie'),
      redTeamId: teams.get('Delta'),
      winner: 'red',
      stageLabel: 'Cuartos de final',
      tournamentId,
      seriesId: q2.id,
      gameNumber: 1,
    })
    for (const game of [2, 3]) {
      await playMatch(db, {
        blueTeamId: teams.get('Charlie'),
        redTeamId: teams.get('Delta'),
        winner: 'blue',
        stageLabel: 'Cuartos de final',
        tournamentId,
        seriesId: q2.id,
        gameNumber: game,
      })
    }

    const { rows } = await db.query<SeriesRow>(
      `select round, team_a_name, team_b_name, wins_a, wins_b, games_played, status, winner_team_id
         from public.series_results order by order_index`,
    )

    const semi = rows.find((row) => row.round === 'Semifinales')
    const cuartosRows = rows.filter((row) => row.round === 'Cuartos de final')

    expect([cuartosRows[0].wins_a, cuartosRows[0].wins_b, cuartosRows[0].games_played]).toEqual([2, 0, 2])
    expect(cuartosRows[0].status).toBe('finished')
    expect([cuartosRows[1].wins_a, cuartosRows[1].wins_b]).toEqual([2, 1])

    // Nadie cargo la semifinal a mano: los dos lados los puso advance_series.
    expect(semi?.team_a_name).toBe('Alfa')
    expect(semi?.team_b_name).toBe('Charlie')
    expect(semi?.status).toBe('pending')
    expect(semi?.winner_team_id).toBeNull()
  })

  it('las partidas de playoffs no ensucian la tabla del grupo', async () => {
    const { rows } = await db.query<StandingRow>(
      `select team_name, games from public.group_standings
        where group_label = 'Grupo A' and team_name = 'Alfa'`,
    )
    // Jugo una de grupos y dos de cuartos; en la tabla del grupo cuenta una sola.
    expect(rows[0].games).toBe(1)
  })

  it('corregir una partida mal cargada corrige el bracket', async () => {
    const q1 = await db.query<{ id: string }>(
      `select id from public.series where round = 'Cuartos de final' order by order_index limit 1`,
    )

    // Se rehacen los dos juegos: ahora la serie la gana Bravo.
    await db.query('update public.matches set winning_side = 200 where series_id = $1', [
      q1.rows[0].id,
    ])

    const after = await db.query<{ team_a_id: string; winner: string }>(
      `select s.team_a_id, q.winner_team_id as winner
         from public.series s, public.series q
        where s.id = $1 and q.id = $2`,
      [semiId, q1.rows[0].id],
    )
    expect(after.rows[0].winner).toBe(teams.get('Bravo'))
    expect(after.rows[0].team_a_id).toBe(teams.get('Bravo'))
  })
})
