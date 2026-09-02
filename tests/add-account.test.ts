import type { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fileSource, normalizeMatch, parseRofl } from '../src/lib/rofl'
import { buildIngestPayload, type IngestPayload } from '../src/lib/ingest/payload'
import { createTestDb } from './helpers/db'
import { playScoreboard } from './helpers/matches'

/**
 * Entering a nick by hand, before that person has played.
 *
 * The case that matters is matchday zero: the team is complete, nothing has
 * been played and the team page's roster is five empty slots. What gets checked
 * is that the manual entry fills those slots and - above all - that when the
 * person finally plays they do not show up twice.
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

describe('entering a nick by hand', () => {
  let db: PGlite
  let team01: string
  let team15: string

  // The full migrations per test: Postgres in WASM is slow, and vitest's
  // default for a hook is 10 seconds.
  beforeEach(async () => {
    db = await createTestDb()

    const teams = await db.query<{ id: string; name: string }>(
      `insert into public.teams (name) values ('Equipo 01'), ('Equipo 15') returning id, name`,
    )
    team01 = teams.rows.find((row) => row.name === 'Equipo 01')!.id
    team15 = teams.rows.find((row) => row.name === 'Equipo 15')!.id
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

  it('registers the account with no PUUID and leaves it on the roster', async () => {
    const result = await alta(team01, 'DenisChang', 'LAN')

    expect(result.ok).toBe(true)
    expect(result.created).toBe(true)
    expect(result.games).toBe(0)

    const player = await db.query<{ puuid: string; riot_game_name: string }>(
      'select puuid, riot_game_name from public.players where id = $1',
      [result.player_id],
    )
    expect(player.rows[0].puuid).toBe('manual:denischang#lan')
    expect(player.rows[0].riot_game_name).toBe('DenisChang')

    // The nick has to show on the team page: that is what it is entered for.
    // With its #TAG beside it, which is what tells two same-nick accounts
    // apart.
    const lineup = await db.query<{ name: string | null; tag_line: string | null }>(
      'select name, tag_line from public.team_lineup where team_id = $1 and name is not null',
      [team01],
    )
    expect(lineup.rows).toEqual([{ name: 'DenisChang', tag_line: 'LAN' }])
  })

  it('the same nick twice does not create two accounts', async () => {
    await alta(team01, 'DenisChang', 'LAN')
    const repetida = await alta(team01, 'denischang', 'lan')

    expect(repetida.ok).toBe(false)
    expect(repetida.error).toMatch(/ya está|ya esta/i)

    const { rows } = await db.query<{ n: string }>('select count(*) as n from public.players')
    expect(Number(rows[0].n)).toBe(1)
  })

  it('if the account has played it reuses it instead of duplicating', async () => {
    await playScoreboard(db, {
      winner: 'blue',
      blue: [{ puuid: 'DenisChang' }],
      red: [{ puuid: 'otro' }],
    })

    const result = await alta(team01, 'DenisChang')

    expect(result.ok).toBe(true)
    expect(result.created).toBe(false)
    expect(result.games).toBe(1)

    const { rows } = await db.query<{ n: string }>('select count(*) as n from public.players')
    expect(Number(rows[0].n)).toBe(2)
  })

  it('does not move anybody between teams on its own', async () => {
    await alta(team01, 'DenisChang', 'LAN')
    const mudanza = await alta(team15, 'DenisChang', 'LAN')

    expect(mudanza.ok).toBe(false)
    expect(mudanza.error).toContain('Equipo 01')
  })

  it('a repeated name with no #TAG does not resolve itself', async () => {
    await db.query(
      `insert into public.players (puuid, riot_game_name, riot_tag_line)
       values ('manual:a#lan', 'Repetido', 'LAN'), ('manual:a#las', 'Repetido', 'LAS')`,
    )

    const result = await alta(team01, 'Repetido')

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/#TAG/)
  })

  it('when that person plays, the ingest gives them their real PUUID', async () => {
    const payload = await fixturePayload()
    const primero = (payload.players as Record<string, unknown>[])[0]

    const result = await alta(
      team01,
      primero.riot_game_name as string,
      primero.riot_tag_line as string | null,
    )
    expect(result.ok).toBe(true)

    await db.query('select public.ingest_match($1::jsonb)', [JSON.stringify(payload)])

    // Ten and not eleven: the hand-entered account is the very same row.
    const players = await db.query<{ n: string }>('select count(*) as n from public.players')
    expect(Number(players.rows[0].n)).toBe(10)

    const adoptada = await db.query<{ puuid: string }>(
      'select puuid from public.players where id = $1',
      [result.player_id],
    )
    expect(adoptada.rows[0].puuid).toBe(primero.puuid)

    // And it is still on the team's roster, now with its match attached.
    const roster = await db.query<{ games: string }>(
      `select count(*) as games
         from public.team_members tm
         join public.match_players mp on mp.player_id = tm.player_id
        where tm.team_id = $1 and tm.player_id = $2 and tm.left_at is null`,
      [team01, result.player_id],
    )
    expect(Number(roster.rows[0].games)).toBe(1)
  })
})
