import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fileSource, normalizeMatch, parseRofl } from '../src/lib/rofl'
import { buildIngestPayload, type IngestPayload } from '../src/lib/ingest/payload'
import { columnsOf, createTestDb } from './helpers/db'

const FIXTURE = 'fixtures/LA2-1602356940.fixture.rofl'

async function fixturePayload(overrides: { sha256: string }): Promise<IngestPayload> {
  const source = await fileSource(FIXTURE)
  try {
    const match = normalizeMatch(await parseRofl(source), {
      fileName: 'LA2-1602356940.rofl',
      playedAt: '2026-06-13T15:07:00.000Z',
    })
    return buildIngestPayload(match, {
      stageLabel: 'Suizo',
      roundLabel: 'Ronda 3',
      file: {
        storage_path: `replays/${overrides.sha256}.rofl`,
        file_name: 'LA2-1602356940.rofl',
        file_size: 16513151,
        sha256: overrides.sha256,
      },
    })
  } finally {
    await source.close?.()
  }
}

describe('schema and ingest (embedded Postgres)', () => {
  let db: PGlite
  let payload: IngestPayload
  let matchId: string

  beforeAll(async () => {
    db = await createTestDb()
    payload = await fixturePayload({ sha256: 'aaa' })
  }, 60_000)

  afterAll(async () => {
    await db?.close()
  })

  it('the payload writes no key that does not exist as a column', async () => {
    const matchColumns = await columnsOf(db, 'matches')
    const playerColumns = await columnsOf(db, 'match_players')

    const matchKeys = Object.keys(payload).filter((k) => k !== 'players' && k !== 'file')
    const playerKeys = Object.keys((payload.players as Record<string, unknown>[])[0])

    expect(matchKeys.filter((k) => !matchColumns.has(k))).toEqual([])
    expect(playerKeys.filter((k) => !playerColumns.has(k))).toEqual([])
  })

  it('ingests the whole match in one go', async () => {
    const { rows } = await db.query<{ ingest_match: { status: string; match_id: string } }>(
      'select public.ingest_match($1::jsonb)',
      [JSON.stringify(payload)],
    )

    expect(rows[0].ingest_match.status).toBe('created')
    matchId = rows[0].ingest_match.match_id

    const match = await db.query<Record<string, unknown>>(
      'select * from public.matches where id = $1',
      [matchId],
    )
    expect(match.rows[0].patch).toBe('16.12')
    expect(match.rows[0].winning_side).toBe(200)
    expect(match.rows[0].stage_label).toBe('Suizo')
    expect(match.rows[0].riot_match_id).toBe('LA2-1602356940')

    const players = await db.query<{ n: string; kills: string }>(
      'select count(*) as n, sum(kills)::text as kills from public.match_players where match_id = $1',
      [matchId],
    )
    expect(Number(players.rows[0].n)).toBe(10)
    expect(Number(players.rows[0].kills)).toBe(42)

    // The 365 raw fields are kept for stats not promoted to columns yet.
    const raw = await db.query<{ keys: number }>(
      `select count(*)::int as keys
         from public.match_players mp, jsonb_object_keys(mp.raw)
        where mp.match_id = $1 and mp.participant_index = 0`,
      [matchId],
    )
    expect(raw.rows[0].keys).toBeGreaterThan(300)
  })

  it('registers the 10 detected players', async () => {
    const { rows } = await db.query<{ n: string }>('select count(*) as n from public.players')
    expect(Number(rows[0].n)).toBe(10)

    const linked = await db.query<{ n: string }>(
      'select count(*) as n from public.match_players where player_id is not null',
    )
    expect(Number(linked.rows[0].n)).toBe(10)
  })

  it('the second .rofl of the same match is stored as proof, not as a new match', async () => {
    const otherTeamFile = await fixturePayload({ sha256: 'bbb' })
    const { rows } = await db.query<{ ingest_match: { status: string; match_id: string } }>(
      'select public.ingest_match($1::jsonb)',
      [JSON.stringify(otherTeamFile)],
    )

    expect(rows[0].ingest_match.status).toBe('duplicate')
    expect(rows[0].ingest_match.match_id).toBe(matchId)

    const matches = await db.query<{ n: string }>('select count(*) as n from public.matches')
    const files = await db.query<{ n: string }>('select count(*) as n from public.match_files')
    expect(Number(matches.rows[0].n)).toBe(1)
    expect(Number(files.rows[0].n)).toBe(2)
  })

  it('the views compute per-side totals and the MVP', async () => {
    const teams = await db.query<{ side: number; kills: string; win: boolean }>(
      'select side, kills::text, win from public.match_team_stats where match_id = $1 order by side',
      [matchId],
    )
    expect(teams.rows.map((r) => Number(r.kills))).toEqual([10, 32])
    expect(teams.rows.map((r) => r.win)).toEqual([false, true])

    const mvp = await db.query<{ champion: string; kills: number; score_pct: string }>(
      'select champion, kills, score_pct::text from public.match_player_scores where match_id = $1 and match_rank = 1',
      [matchId],
    )
    // Yasuo 17/4/9 with 45k damage in the real match
    expect(mvp.rows[0].champion).toBe('Yasuo')
    expect(mvp.rows[0].kills).toBe(17)
    expect(Number(mvp.rows[0].score_pct)).toBe(1)

    const summary = await db.query<Record<string, unknown>>(
      'select * from public.match_summaries where id = $1',
      [matchId],
    )
    expect(summary.rows[0].mvp_champion).toBe('Yasuo')
    expect(Number(summary.rows[0].blue_kills)).toBe(10)
    expect(Number(summary.rows[0].file_count)).toBe(2)
  })

  it('accumulates per player even with no teams loaded yet', async () => {
    const { rows } = await db.query<{ games: string; kda: string; mvp_count: string }>(
      // By player_id and no longer by puuid: the puuid stopped leaving the
      // database when the site opened to the public (0013_publico.sql).
      `select pt.games::text, pt.kda::text, pt.mvp_count::text
         from public.player_totals pt
         join public.match_players mp on mp.player_id = pt.player_id
        where mp.champion = 'Yasuo'`,
    )
    expect(Number(rows[0].games)).toBe(1)
    expect(Number(rows[0].mvp_count)).toBe(1)
  })

  it('links the teams by PUUID majority once the roster is loaded', async () => {
    await db.exec(`
      insert into public.teams (id, name)
      values ('11111111-1111-1111-1111-111111111111', 'Equipo Rojo');

      insert into public.team_members (team_id, player_id)
      select '11111111-1111-1111-1111-111111111111', p.id
        from public.players p
        join public.match_players mp on mp.puuid = p.puuid
       where mp.side = 200;
    `)

    const { rows } = await db.query<{ relink_all_matches: number }>(
      'select public.relink_all_matches()',
    )
    expect(rows[0].relink_all_matches).toBe(1)

    const match = await db.query<{ red_team_id: string; blue_team_id: string | null }>(
      'select red_team_id, blue_team_id from public.matches where id = $1',
      [matchId],
    )
    expect(match.rows[0].red_team_id).toBe('11111111-1111-1111-1111-111111111111')
    expect(match.rows[0].blue_team_id).toBeNull()

    const tagged = await db.query<{ n: string }>(
      'select count(*) as n from public.match_players where match_id = $1 and team_id is not null',
      [matchId],
    )
    expect(Number(tagged.rows[0].n)).toBe(5)

    const totals = await db.query<{ games: string; wins: string }>(
      'select games::text, wins::text from public.team_totals where name = $1',
      ['Equipo Rojo'],
    )
    expect(Number(totals.rows[0].games)).toBe(1)
    expect(Number(totals.rows[0].wins)).toBe(1)
  })
})
