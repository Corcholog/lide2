import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb } from './helpers/db'

/**
 * Las partidas se arman a mano (dos jugadores por partida, uno por lado) en
 * lugar de ingestar un .rofl: lo que se prueba es la agregación de la tabla de
 * posiciones, y para eso alcanza con los kills de cada lado.
 */
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

let matchSeq = 0

async function play(db: PGlite, teams: Map<string, string>, game: Played): Promise<void> {
  const winningSide = game.winner === 'blue' ? 100 : 200
  const id = `00000000-0000-0000-0000-${String(++matchSeq).padStart(12, '0')}`

  await db.query(
    `insert into public.matches
       (id, fingerprint, format, game_length_ms, played_at, winning_side,
        blue_team_id, red_team_id, stage_label, round_label, raw_metadata)
     values ($1, $2, 'CLASSIC', 1800000, $3, $4, $5, $6, $7, $8, '{}'::jsonb)`,
    [
      id,
      `fp-${matchSeq}`,
      game.playedAt,
      winningSide,
      teams.get(game.blue),
      teams.get(game.red),
      game.stage,
      game.round,
    ],
  )

  for (const [side, kills] of [
    [100, game.blueKills],
    [200, game.redKills],
  ] as const) {
    await db.query(
      `insert into public.match_players
         (match_id, side, participant_index, puuid, champion, win, kills, gold_earned, raw)
       values ($1, $2, $3, $4, 'Ahri', $5, $6, $7, '{}'::jsonb)`,
      [id, side, side, `puuid-${matchSeq}-${side}`, side === winningSide, kills, kills * 1000],
    )
  }
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

describe('tabla de posiciones', () => {
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
      // Bloque A, fecha 1
      { blue: 'Alfa', red: 'Bravo', winner: 'blue', blueKills: 20, redKills: 10, stage: 'Bloque A', round: 'Fecha 1', playedAt: '2026-05-16T22:00:00Z' },
      { blue: 'Charlie', red: 'Delta', winner: 'blue', blueKills: 15, redKills: 12, stage: 'Bloque A', round: 'Fecha 1', playedAt: '2026-05-16T22:00:00Z' },
      // Bloque A, fecha 2
      { blue: 'Alfa', red: 'Charlie', winner: 'red', blueKills: 14, redKills: 18, stage: 'Bloque A', round: 'Fecha 2', playedAt: '2026-05-23T22:00:00Z' },
      { blue: 'Bravo', red: 'Delta', winner: 'blue', blueKills: 25, redKills: 5, stage: 'Bloque A', round: 'Fecha 2', playedAt: '2026-05-23T22:00:00Z' },
      // Otro bloque: tiene su propia tabla
      { blue: 'Eco', red: 'Fox', winner: 'blue', blueKills: 11, redKills: 9, stage: 'Bloque B', round: 'Fecha 1', playedAt: '2026-05-16T22:00:00Z' },
    ]

    for (const game of fixture) await play(db, teams, game)

    // Partida de un equipo contra rivales sin roster cargado: no cuenta.
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

  it('da vuelta cada partida a dos filas equipo/rival', async () => {
    const { rows } = await db.query<{ n: string }>(
      'select count(*) as n from public.team_match_results',
    )
    // 5 partidas con los dos equipos vinculados, mas el lado suelto de la sexta.
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

  it('ordena por victorias y desempata por diferencia de kills', async () => {
    const { rows } = await db.query<StandingRow>(
      `select team_name, games, wins, losses, kill_diff::text, position, form
         from public.team_standings where stage_label = 'Bloque A' order by position`,
    )

    expect(rows.map((r) => r.team_name)).toEqual(['Charlie', 'Bravo', 'Alfa', 'Delta'])
    expect(rows.map((r) => r.wins)).toEqual([2, 1, 1, 0])

    // Bravo y Alfa empatan 1-1: pasa Bravo por diferencia (+10 contra +6).
    const [, bravo, alfa] = rows
    expect(Number(bravo.kill_diff)).toBe(10)
    expect(Number(alfa.kill_diff)).toBe(6)
  })

  it('cada etapa tiene su propia tabla', async () => {
    const { rows } = await db.query<StandingRow>(
      `select team_name, wins, position from public.team_standings
        where stage_label = 'Bloque B' order by position`,
    )
    expect(rows.map((r) => [r.team_name, r.position])).toEqual([
      ['Eco', 1],
      ['Fox', 2],
    ])
  })

  it('no cuenta las partidas donde falta vincular al rival', async () => {
    const { rows } = await db.query<StandingRow>(
      `select games, wins, losses from public.team_standings where team_name = 'Delta'`,
    )
    expect(rows[0].games).toBe(2)
    expect(rows[0].losses).toBe(2)
  })

  it('deja los ultimos resultados listos para la rachita', async () => {
    const { rows } = await db.query<StandingRow>(
      `select form from public.team_standings where team_name = 'Alfa'`,
    )
    // Del mas nuevo al mas viejo: perdio con Charlie, antes le gano a Bravo.
    expect(rows[0].form).toEqual([false, true])
  })
})
