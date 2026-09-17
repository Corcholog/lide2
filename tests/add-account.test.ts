import type { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fileSource, normalizeMatch, parseRofl } from '../src/lib/rofl'
import { buildIngestPayload, type IngestPayload } from '../src/lib/ingest/payload'
import { createTestDb } from './helpers/db'
import { playScoreboard } from './helpers/matches'

/**
 * Entering a nick by hand before that person has played.
 *
 * Before the first matchday the lineup is five empty slots. The hand entry must
 * fill them and, above all, must not create a duplicate account when the person
 * finally plays.
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

  // Full migrations per test: PGlite is slow, and vitest's default hook timeout
  // is 10 seconds.
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

  async function addAccount(
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
    const result = await addAccount(team01, 'DarioFerro', 'LAN')

    expect(result.ok).toBe(true)
    expect(result.created).toBe(true)
    expect(result.games).toBe(0)

    const player = await db.query<{ puuid: string; riot_game_name: string }>(
      'select puuid, riot_game_name from public.players where id = $1',
      [result.player_id],
    )
    expect(player.rows[0].puuid).toBe('manual:darioferro#lan')
    expect(player.rows[0].riot_game_name).toBe('DarioFerro')

    // The nick shows on the team page, with its #TAG to tell same-nick accounts
    // apart.
    const lineup = await db.query<{ name: string | null; tag_line: string | null }>(
      'select name, tag_line from public.team_lineup where team_id = $1 and name is not null',
      [team01],
    )
    expect(lineup.rows).toEqual([{ name: 'DarioFerro', tag_line: 'LAN' }])
  })

  it('the same nick twice does not create two accounts', async () => {
    await addAccount(team01, 'DarioFerro', 'LAN')
    const duplicate = await addAccount(team01, 'darioferro', 'lan')

    expect(duplicate.ok).toBe(false)
    expect(duplicate.error).toMatch(/ya está|ya esta/i)

    const { rows } = await db.query<{ n: string }>('select count(*) as n from public.players')
    expect(Number(rows[0].n)).toBe(1)
  })

  it('if the account has played it reuses it instead of duplicating', async () => {
    await playScoreboard(db, {
      winner: 'blue',
      blue: [{ puuid: 'DarioFerro' }],
      red: [{ puuid: 'otro' }],
    })

    const result = await addAccount(team01, 'DarioFerro')

    expect(result.ok).toBe(true)
    expect(result.created).toBe(false)
    expect(result.games).toBe(1)

    const { rows } = await db.query<{ n: string }>('select count(*) as n from public.players')
    expect(Number(rows[0].n)).toBe(2)
  })

  it('does not move anybody between teams on its own', async () => {
    await addAccount(team01, 'DarioFerro', 'LAN')
    const moved = await addAccount(team15, 'DarioFerro', 'LAN')

    expect(moved.ok).toBe(false)
    expect(moved.error).toContain('Equipo 01')
  })

  it('a repeated name with no #TAG does not resolve itself', async () => {
    await db.query(
      `insert into public.players (puuid, riot_game_name, riot_tag_line)
       values ('manual:a#lan', 'Repetido', 'LAN'), ('manual:a#las', 'Repetido', 'LAS')`,
    )

    const result = await addAccount(team01, 'Repetido')

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/#TAG/)
  })

  it('when that person plays, the ingest gives them their real PUUID', async () => {
    const payload = await fixturePayload()
    const first = (payload.players as Record<string, unknown>[])[0]

    const result = await addAccount(
      team01,
      first.riot_game_name as string,
      first.riot_tag_line as string | null,
    )
    expect(result.ok).toBe(true)

    await db.query('select public.ingest_match($1::jsonb)', [JSON.stringify(payload)])

    // Ten, not eleven: the hand-entered account is the same row.
    const players = await db.query<{ n: string }>('select count(*) as n from public.players')
    expect(Number(players.rows[0].n)).toBe(10)

    const adopted = await db.query<{ puuid: string }>(
      'select puuid from public.players where id = $1',
      [result.player_id],
    )
    expect(adopted.rows[0].puuid).toBe(first.puuid)

    // Still on the team's roster, now with its match.
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
