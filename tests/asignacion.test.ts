import type { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from './helpers/db'
import { playScoreboard } from './helpers/matches'

/**
 * Enganchar una partida con su cruce del fixture.
 *
 * El caso que importa es el del 5 de septiembre: no hay ningun plantel cargado,
 * asi que la base no puede saber quien jugo. Lo que se verifica es que asignar
 * el cruce alcance para que despues todo lo demas se acomode solo, y que la
 * segunda fecha ya no necesite que le digan la orientacion.
 */

interface AssignResult {
  ok: boolean
  error?: string
  learned?: number
  conflicts?: string[]
  blue_team_id?: string
  red_team_id?: string
}

const A = ['a1', 'a2', 'a3', 'a4', 'a5']
const B = ['b1', 'b2', 'b3', 'b4', 'b5']

describe('asignacion de partidas al fixture', () => {
  let db: PGlite
  let tournamentId: string
  let equipo01: string
  let equipo15: string
  let cruceF1: string
  let cruceF2: string

  beforeEach(async () => {
    db = await createTestDb()

    const tournament = await db.query<{ id: string }>(
      `insert into public.tournaments (name, slug) values ('LIDE 2', 'lide-2') returning id`,
    )
    tournamentId = tournament.rows[0].id

    const teams = await db.query<{ id: string; name: string }>(
      `insert into public.teams (tournament_id, name, group_label)
       values ($1, 'Equipo 01', 'Grupo A'), ($1, 'Equipo 15', 'Grupo A')
       returning id, name`,
      [tournamentId],
    )
    equipo01 = teams.rows.find((row) => row.name === 'Equipo 01')!.id
    equipo15 = teams.rows.find((row) => row.name === 'Equipo 15')!.id

    const fixtures = await db.query<{ id: string; matchday: number }>(
      `insert into public.fixtures
         (tournament_id, group_label, matchday, slot, kickoff, team_a_id, team_b_id)
       values
         ($1, 'Grupo A', 1, 1, '2026-09-05T17:00:00Z', $2, $3),
         ($1, 'Grupo A', 2, 1, '2026-09-12T17:00:00Z', $3, $2)
       returning id, matchday`,
      [tournamentId, equipo01, equipo15],
    )
    cruceF1 = fixtures.rows.find((row) => row.matchday === 1)!.id
    cruceF2 = fixtures.rows.find((row) => row.matchday === 2)!.id
  }, 60_000)

  afterEach(async () => {
    await db?.close()
  })

  async function subir(options: {
    blue: string[]
    red: string[]
    winner?: 'blue' | 'red'
    playedAt?: string
  }): Promise<string> {
    return playScoreboard(db, {
      winner: options.winner ?? 'blue',
      playedAt: options.playedAt,
      blue: options.blue.map((puuid) => ({ puuid, kills: 3, deaths: 2, assists: 4 })),
      red: options.red.map((puuid) => ({ puuid, kills: 2, deaths: 3, assists: 3 })),
    })
  }

  async function asignar(
    matchId: string,
    fixtureId: string,
    blueTeamId?: string | null,
  ): Promise<AssignResult> {
    const { rows } = await db.query<{ assign_match_to_fixture: AssignResult }>(
      'select public.assign_match_to_fixture($1, $2, $3)',
      [matchId, fixtureId, blueTeamId ?? null],
    )
    return rows[0].assign_match_to_fixture
  }

  it('una partida recien subida aparece en la cola sin equipos', async () => {
    const matchId = await subir({ blue: A, red: B })

    const { rows } = await db.query<{
      match_id: string
      blue_guess: string | null
      blue_players: { name: string }[]
    }>('select match_id, blue_guess, blue_players from public.unassigned_matches')

    expect(rows).toHaveLength(1)
    expect(rows[0].match_id).toBe(matchId)
    // Sin planteles cargados no hay nada que deducir: por eso el panel pregunta.
    expect(rows[0].blue_guess).toBeNull()
    expect(rows[0].blue_players.map((p) => p.name)).toEqual(A)
  })

  it('asignar el cruce ensena el plantel y deja la partida completa', async () => {
    const matchId = await subir({ blue: A, red: B })
    const result = await asignar(matchId, cruceF1, equipo01)

    expect(result.ok).toBe(true)
    expect(result.learned).toBe(10)
    expect(result.conflicts).toEqual([])

    const match = await db.query<{
      blue_team_id: string
      red_team_id: string
      tournament_id: string
      stage_label: string
      round_label: string
    }>(
      `select blue_team_id, red_team_id, tournament_id, stage_label, round_label
         from public.matches where id = $1`,
      [matchId],
    )
    expect(match.rows[0]).toMatchObject({
      blue_team_id: equipo01,
      red_team_id: equipo15,
      tournament_id: tournamentId,
      stage_label: 'Grupo A',
      round_label: 'Fecha 1',
    })

    const roster = await db.query<{ n: string }>(
      `select count(*) as n from public.team_members where team_id = $1 and left_at is null`,
      [equipo01],
    )
    expect(Number(roster.rows[0].n)).toBe(5)

    // Y ya sale de la cola.
    const cola = await db.query('select 1 from public.unassigned_matches')
    expect(cola.rows).toHaveLength(0)
  })

  it('la tabla y las estadisticas se enteran solas', async () => {
    const matchId = await subir({ blue: A, red: B })
    await asignar(matchId, cruceF1, equipo01)

    const standings = await db.query<{ team_name: string; games: number; wins: number }>(
      `select team_name, games, wins from public.group_standings
        where tournament_id = $1 order by team_name`,
      [tournamentId],
    )
    expect(standings.rows.map((r) => [r.team_name, Number(r.games), Number(r.wins)])).toEqual([
      ['Equipo 01', 1, 1],
      ['Equipo 15', 1, 0],
    ])

    const context = await db.query<{ matchday: number; phase: string }>(
      'select matchday, phase from public.match_context where match_id = $1',
      [matchId],
    )
    expect(context.rows[0]).toMatchObject({ matchday: 1, phase: 'grupos' })

    const stats = await db.query<{ n: string }>(
      `select count(*) as n from public.player_phase_totals
        where tournament_id = $1 and not is_total and matchday = 1`,
      [tournamentId],
    )
    expect(Number(stats.rows[0].n)).toBe(10)
  })

  it('con el plantel ya aprendido, la segunda fecha no necesita que le digan nada', async () => {
    await asignar(await subir({ blue: A, red: B }), cruceF1, equipo01)

    // Fecha 2: los mismos equipos, invertidos de lado.
    const segunda = await subir({ blue: B, red: A, playedAt: '2026-09-12T17:00:00Z' })

    const cola = await db.query<{ blue_guess: string; red_guess: string }>(
      'select blue_guess, red_guess from public.unassigned_matches',
    )
    expect(cola.rows[0]).toMatchObject({ blue_guess: equipo15, red_guess: equipo01 })

    // Sin tercer argumento: la orientacion se deduce.
    const result = await asignar(segunda, cruceF2)
    expect(result.ok).toBe(true)
    expect(result.blue_team_id).toBe(equipo15)
    expect(result.learned).toBe(0)
  })

  it('no se puede asignar un cruce que ese equipo no juega', async () => {
    const otro = await db.query<{ id: string }>(
      `insert into public.teams (tournament_id, name, group_label)
       values ($1, 'Equipo 07', 'Grupo A') returning id`,
      [tournamentId],
    )

    const result = await asignar(await subir({ blue: A, red: B }), cruceF1, otro.rows[0].id)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/no juega/i)
  })

  it('sin plantel y sin orientacion, pide que la elijan en vez de inventar', async () => {
    const result = await asignar(await subir({ blue: A, red: B }), cruceF1)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/azul/i)
  })

  it('reasignar a otro cruce libera el anterior', async () => {
    const matchId = await subir({ blue: A, red: B })
    await asignar(matchId, cruceF1, equipo01)
    await asignar(matchId, cruceF2, equipo01)

    const { rows } = await db.query<{ matchday: number; match_id: string | null }>(
      'select matchday, match_id from public.fixtures order by matchday',
    )
    expect(rows.map((r) => r.match_id)).toEqual([null, matchId])
  })

  it('un jugador que ya tiene equipo no se muda solo: se avisa', async () => {
    await asignar(await subir({ blue: A, red: B }), cruceF1, equipo01)

    // a1, que es del 01, aparece jugando DEL LADO del 15. Es una partida mal
    // asignada o alguien jugando donde no debe: las dos cosas las mira una
    // persona, no se resuelven mudandolo de equipo en silencio.
    const segunda = await subir({
      blue: ['a1', 'b2', 'b3', 'b4', 'b5'],
      red: ['c1', 'c2', 'c3', 'c4', 'c5'],
      playedAt: '2026-09-12T17:00:00Z',
    })
    const result = await asignar(segunda, cruceF2, equipo15)

    expect(result.ok).toBe(true)
    expect(result.conflicts).toEqual(['a1'])
    // Los cinco del otro lado si son nuevos y se dan de alta.
    expect(result.learned).toBe(5)

    const teams = await db.query<{ n: string }>(
      `select count(*) as n from public.team_members
        where player_id = (select id from public.players where puuid = 'a1') and left_at is null`,
    )
    expect(Number(teams.rows[0].n)).toBe(1)
  })

  it('desasignar deja la partida libre pero no borra lo aprendido', async () => {
    const matchId = await subir({ blue: A, red: B })
    await asignar(matchId, cruceF1, equipo01)

    await db.query('select public.unassign_match($1)', [matchId])

    const fixture = await db.query<{ match_id: string | null }>(
      'select match_id from public.fixtures where id = $1',
      [cruceF1],
    )
    expect(fixture.rows[0].match_id).toBeNull()

    const roster = await db.query<{ n: string }>(
      'select count(*) as n from public.team_members where left_at is null',
    )
    expect(Number(roster.rows[0].n)).toBe(10)

    // Los equipos se vuelven a deducir con lo que ya se sabe, asi que la
    // partida sigue sabiendo quien jugo aunque no sea ningun cruce.
    const match = await db.query<{ blue_team_id: string | null; round_label: string | null }>(
      'select blue_team_id, round_label from public.matches where id = $1',
      [matchId],
    )
    expect(match.rows[0].blue_team_id).toBe(equipo01)
    expect(match.rows[0].round_label).toBeNull()
  })
})
