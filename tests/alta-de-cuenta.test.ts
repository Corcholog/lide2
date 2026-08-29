import type { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fileSource, normalizeMatch, parseRofl } from '../src/lib/rofl'
import { buildIngestPayload, type IngestPayload } from '../src/lib/ingest/payload'
import { createTestDb } from './helpers/db'
import { playScoreboard } from './helpers/matches'

/**
 * Cargar un nick a mano, antes de que esa persona juegue.
 *
 * El caso que importa es el de la fecha 0: el equipo está completo, no se jugó
 * nada todavía y el plantel de la ficha son cinco casilleros vacíos. Se verifica
 * que el alta manual llene esos casilleros y —sobre todo— que cuando la persona
 * finalmente juegue no aparezca dos veces.
 */

interface AccountResult {
  ok: boolean
  error?: string
  player_id?: string
  created?: boolean
  games?: number
}

const FIXTURE = 'fixtures/LA2-1602356940.fixture.rofl'

async function fixturePayload(): Promise<IngestPayload> {
  const source = await fileSource(FIXTURE)
  try {
    const match = normalizeMatch(await parseRofl(source), {
      fileName: 'LA2-1602356940.rofl',
      playedAt: '2026-09-05T22:00:00.000Z',
    })
    return buildIngestPayload(match, {
      file: {
        storage_path: 'replays/uno.rofl',
        file_name: 'LA2-1602356940.rofl',
        file_size: 16513151,
        sha256: 'sha-uno',
      },
    })
  } finally {
    await source.close?.()
  }
}

describe('cargar un nick a mano', () => {
  let db: PGlite
  let equipo01: string
  let equipo15: string

  // Las migraciones enteras por test: Postgres en WASM tarda, y el default de
  // vitest para un hook son 10 segundos.
  beforeEach(async () => {
    db = await createTestDb()

    const teams = await db.query<{ id: string; name: string }>(
      `insert into public.teams (name) values ('Equipo 01'), ('Equipo 15') returning id, name`,
    )
    equipo01 = teams.rows.find((row) => row.name === 'Equipo 01')!.id
    equipo15 = teams.rows.find((row) => row.name === 'Equipo 15')!.id
  }, 60_000)

  afterEach(async () => {
    await db?.close()
  })

  async function alta(
    teamId: string,
    gameName: string,
    tagLine: string | null = null,
  ): Promise<AccountResult> {
    const { rows } = await db.query<{ add_team_account: AccountResult }>(
      'select public.add_team_account($1, $2, $3)',
      [teamId, gameName, tagLine],
    )
    return rows[0].add_team_account
  }

  it('da de alta la cuenta sin PUUID y la deja en el plantel', async () => {
    const result = await alta(equipo01, 'DenisChang', 'LAN')

    expect(result.ok).toBe(true)
    expect(result.created).toBe(true)
    expect(result.games).toBe(0)

    const player = await db.query<{ puuid: string; riot_game_name: string }>(
      'select puuid, riot_game_name from public.players where id = $1',
      [result.player_id],
    )
    expect(player.rows[0].puuid).toBe('manual:denischang#lan')
    expect(player.rows[0].riot_game_name).toBe('DenisChang')

    // El nick tiene que verse en la ficha del equipo: es para lo que se carga.
    // Con su #TAG al lado, que es lo que distingue dos cuentas del mismo nick.
    const lineup = await db.query<{ name: string | null; tag_line: string | null }>(
      'select name, tag_line from public.team_lineup where team_id = $1 and name is not null',
      [equipo01],
    )
    expect(lineup.rows).toEqual([{ name: 'DenisChang', tag_line: 'LAN' }])
  })

  it('el mismo nick dos veces no crea dos cuentas', async () => {
    await alta(equipo01, 'DenisChang', 'LAN')
    const repetida = await alta(equipo01, 'denischang', 'lan')

    expect(repetida.ok).toBe(false)
    expect(repetida.error).toMatch(/ya está|ya esta/i)

    const { rows } = await db.query<{ n: string }>('select count(*) as n from public.players')
    expect(Number(rows[0].n)).toBe(1)
  })

  it('si la cuenta ya jugó la reusa en vez de duplicarla', async () => {
    await playScoreboard(db, {
      winner: 'blue',
      blue: [{ puuid: 'DenisChang' }],
      red: [{ puuid: 'otro' }],
    })

    const result = await alta(equipo01, 'DenisChang')

    expect(result.ok).toBe(true)
    expect(result.created).toBe(false)
    expect(result.games).toBe(1)

    const { rows } = await db.query<{ n: string }>('select count(*) as n from public.players')
    expect(Number(rows[0].n)).toBe(2)
  })

  it('no muda a nadie de un equipo a otro por su cuenta', async () => {
    await alta(equipo01, 'DenisChang', 'LAN')
    const mudanza = await alta(equipo15, 'DenisChang', 'LAN')

    expect(mudanza.ok).toBe(false)
    expect(mudanza.error).toContain('Equipo 01')
  })

  it('un nombre repetido sin #TAG no se resuelve solo', async () => {
    await db.query(
      `insert into public.players (puuid, riot_game_name, riot_tag_line)
       values ('manual:a#lan', 'Repetido', 'LAN'), ('manual:a#las', 'Repetido', 'LAS')`,
    )

    const result = await alta(equipo01, 'Repetido')

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/#TAG/)
  })

  it('cuando esa persona juega, la ingesta le pone el PUUID de verdad', async () => {
    const payload = await fixturePayload()
    const primero = (payload.players as Record<string, unknown>[])[0]

    const result = await alta(
      equipo01,
      primero.riot_game_name as string,
      primero.riot_tag_line as string | null,
    )
    expect(result.ok).toBe(true)

    await db.query('select public.ingest_match($1::jsonb)', [JSON.stringify(payload)])

    // Diez y no once: la cuenta cargada a mano es la misma fila de siempre.
    const players = await db.query<{ n: string }>('select count(*) as n from public.players')
    expect(Number(players.rows[0].n)).toBe(10)

    const adoptada = await db.query<{ puuid: string }>(
      'select puuid from public.players where id = $1',
      [result.player_id],
    )
    expect(adoptada.rows[0].puuid).toBe(primero.puuid)

    // Y sigue en el plantel del equipo, ahora con su partida colgada.
    const plantel = await db.query<{ games: string }>(
      `select count(*) as games
         from public.team_members tm
         join public.match_players mp on mp.player_id = tm.player_id
        where tm.team_id = $1 and tm.player_id = $2 and tm.left_at is null`,
      [equipo01, result.player_id],
    )
    expect(Number(plantel.rows[0].games)).toBe(1)
  })
})
