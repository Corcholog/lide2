import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ACCUMULATED, buildPosters, kickerFor, BY_MATCHDAY } from '@/lib/cards/batch'
import { toCsv, toPlainText } from '@/lib/cards/export'
import { groupTables, matchdayNumbers } from '@/lib/cards/summary'
import { STATS } from '@/lib/stats/registry'
import type { StatBlock, StatScope, StatsData } from '@/lib/stats/types'
import type { GroupStandingRow, MatchRecordRow } from '@/types/db'
import { createTestDb } from './helpers/db'
import { playScoreboard } from './helpers/matches'

/**
 * The batch of pieces.
 *
 * Nearly everything here is pure functions over what the database returns, so
 * they are tested without a database. At the end there is a full run against
 * embedded Postgres, which is the only thing that verifies the views and the
 * batch speak the same language: a misplaced filter returns zero rows without
 * an error, and without this test the symptom would be an empty page on the
 * day of the first matchday.
 */

/**
 * The transport differences between PGlite and PostgREST.
 *
 * PGlite speaks the Postgres protocol, like node-postgres: `numeric` and
 * `bigint` arrive as text (they do not fit a `number` without losing precision)
 * and dates arrive as `Date`. PostgREST returns JSON: numbers and ISO text.
 *
 * The stats engine does arithmetic with those values (`row.kda.toFixed`,
 * `played_at.localeCompare`), so without this the test fails because of the
 * transport and not because of the code, which is the worst kind of test: red
 * while everything is fine.
 *
 * The dates are left as the protocol's raw text instead of ISO. It is enough
 * for the only thing done with them here, which is comparing to break ties.
 */
const COMO_POSTGREST = {
  20: Number,
  700: Number,
  701: Number,
  1700: Number,
  1082: String,
  1114: String,
  1184: String,
}

/**
 * The same as `loadStats`, against PGlite.
 *
 * The filters are repeated instead of importing the function because that one
 * speaks PostgREST. If the two drift apart, the test at the end shows it: the
 * batch would come out empty.
 */
async function loadFromDb(db: PGlite, scope: StatScope): Promise<StatsData> {
  const total = scope.matchday === null
  const where = total
    ? 'tournament_id = $1 and phase = $2 and is_total'
    : 'tournament_id = $1 and phase = $2 and not is_total and matchday = $3'
  const params = total
    ? [scope.tournamentId, scope.phase]
    : [scope.tournamentId, scope.phase, scope.matchday]

  // One at a time and not with Promise.all: PGlite is a single connection and
  // concurrent queries hang without an error. In production it is six parallel
  // trips to Postgres, which does cope.
  const view = async <T>(name: string) =>
    (await db.query<T>(`select * from public.${name} where ${where}`, params, { parsers: COMO_POSTGREST }))
      .rows

  const recordsWhere = total
    ? 'tournament_id = $1 and phase = $2'
    : 'tournament_id = $1 and phase = $2 and matchday = $3'

  const players = await view<StatsData['players'][number]>('player_phase_totals')
  const teams = await view<StatsData['teams'][number]>('team_phase_totals')
  const universities = await view<StatsData['universities'][number]>('university_totals')
  const champions = await view<StatsData['champions'][number]>('champion_stats')
  const mvp = await view<StatsData['mvp'][number]>('tournament_mvp')
  const records = await db.query<MatchRecordRow>(
    `select * from public.match_records where ${recordsWhere}`,
    params,
    { parsers: COMO_POSTGREST },
  )

  return { scope, players, teams, universities, champions, records: records.rows, mvp }
}

async function standingsFromDb(db: PGlite, tournamentId: string): Promise<GroupStandingRow[]> {
  const { rows } = await db.query<GroupStandingRow>(
    'select * from public.group_standings where tournament_id = $1 order by position',
    [tournamentId],
    { parsers: COMO_POSTGREST },
  )
  return rows
}

const scope = (matchday: number | null): StatScope => ({
  tournamentId: 't1',
  phase: 'grupos',
  matchday,
})

function record(overrides: Partial<MatchRecordRow> = {}): MatchRecordRow {
  return {
    match_id: 'm1',
    tournament_id: 't1',
    phase: 'grupos',
    group_label: 'Grupo A',
    matchday: 1,
    slot: 1,
    round_label: 'Fecha 1',
    played_at: '2026-09-05T17:00:00Z',
    game_length_ms: 1_800_000,
    minutes: 30,
    ended_in_surrender: false,
    patch: '16.12',
    blue_team_id: 'a',
    blue_team_name: 'Equipo 01',
    blue_kills: 12,
    blue_gold: 55_000,
    red_team_id: 'b',
    red_team_name: 'Equipo 07',
    red_kills: 8,
    red_gold: 50_000,
    total_kills: 20,
    kill_gap: 4,
    gold_gap: 5_000,
    winner_team_id: 'a',
    winner_name: 'Equipo 01',
    loser_name: 'Equipo 07',
    ...overrides,
  }
}

function standing(overrides: Partial<GroupStandingRow> = {}): GroupStandingRow {
  return {
    tournament_id: 't1',
    group_label: 'Grupo A',
    team_id: 'a',
    team_name: 'Equipo 01',
    team_tag: null,
    team_logo: null,
    university_id: 'u1',
    university_name: 'Universidad Nacional de La Plata',
    university_tag: 'UNLP',
    university_logo: null,
    games: 2,
    wins: 2,
    losses: 0,
    kills: 30,
    kills_against: 12,
    kill_diff: 18,
    gold_diff: 9_000,
    avg_minutes: 30,
    last_played_at: '2026-09-05T17:00:00Z',
    form: [true, true],
    position: 1,
    university_tags: ['UNLP'],
    ...overrides,
  }
}

function data(overrides: Partial<StatsData> = {}): StatsData {
  return {
    scope: scope(1),
    players: [],
    teams: [],
    universities: [],
    champions: [],
    records: [],
    mvp: [],
    ...overrides,
  }
}

describe("the matchday's numbers", () => {
  it('with no matches there is no piece', () => {
    expect(matchdayNumbers(data())).toBeNull()
  })

  it('counts matches and kills, and works out the average', () => {
    const block = matchdayNumbers(
      data({ records: [record(), record({ match_id: 'm2', total_kills: 30 })] }),
    )!

    const matches = block.rows.find((row) => row.id === 'partidas')!
    const kills = block.rows.find((row) => row.id === 'kills')!

    expect(matches.value).toBe(2)
    expect(kills.value).toBe(50)
    expect(kills.detail).toBe('25.0 por partida')
  })

  it('the longest and the shortest, with who played them', () => {
    const block = matchdayNumbers(
      data({
        records: [
          record({ match_id: 'corta', game_length_ms: 900_000 }),
          record({ match_id: 'larga', game_length_ms: 2_700_000, red_team_name: 'Equipo 12' }),
        ],
      }),
    )!

    const larga = block.rows.find((row) => row.id === 'mas-larga')!
    const corta = block.rows.find((row) => row.id === 'mas-corta')!

    expect(larga.display).toBe('45:00')
    expect(larga.subtitle).toBe('Equipo 01 vs Equipo 12')
    expect(corta.display).toBe('15:00')
  })

  it('with a single match it does not repeat it as both longest and shortest', () => {
    const block = matchdayNumbers(data({ records: [record()] }))!
    const ids = block.rows.map((row) => row.id)

    expect(ids).toContain('mas-larga')
    expect(ids).not.toContain('mas-corta')
  })

  it('the closest one is measured by gold, not by kills', () => {
    // The kill blowout is level on gold; the other was won on gold by a mile.
    const block = matchdayNumbers(
      data({
        records: [
          record({ match_id: 'paliza', blue_kills: 25, red_kills: 3, gold_gap: 1_200 }),
          record({ match_id: 'apretada', blue_kills: 11, red_kills: 10, gold_gap: 14_000 }),
        ],
      }),
    )!

    expect(block.rows.find((row) => row.id === 'mas-pareja')!.value).toBe(1_200)
  })

  it('ignores matches with no gold when picking the closest one', () => {
    // An old replay may carry no gold: zero does not mean "it was razor close".
    const block = matchdayNumbers(
      data({
        records: [
          record({ match_id: 'sin-oro', blue_gold: 0, red_gold: 0, gold_gap: 0 }),
          record({ match_id: 'con-oro', gold_gap: 8_000 }),
        ],
      }),
    )!

    expect(block.rows.find((row) => row.id === 'mas-pareja')!.value).toBe(8_000)
  })

  it('the closest one shows the gold and not the scoreline', () => {
    // Showing the kills would make the piece contradict itself: the real
    // closest game of matchday 1 ended 44-25, with a 1.4k gold gap.
    const block = matchdayNumbers(
      data({ records: [record({ blue_gold: 55_000, red_gold: 50_000 })] }),
    )!
    expect(block.rows.find((row) => row.id === 'mas-pareja')!.detail).toBe('55.0k vs 50.0k')
  })

  it('the accumulated total is not called "la jornada", which is three of them', () => {
    expect(matchdayNumbers(data({ records: [record()] }))!.subtitle).toBe('Lo que dejó la jornada')
    expect(matchdayNumbers(data({ scope: scope(null), records: [record()] }))!.subtitle).toBe(
      'Lo que va de la fase',
    )
  })
})

describe('the group tables', () => {
  it('one piece per group, in alphabetical order', () => {
    const blocks = groupTables([
      standing({ group_label: 'Grupo B', team_id: 'x', team_name: 'Equipo 09' }),
      standing({ group_label: 'Grupo A' }),
    ])

    expect(blocks.map((block) => block.title)).toEqual(['Grupo A', 'Grupo B'])
    expect(blocks[0].id).toBe('tabla-grupo-a')
  })

  it('honours the position order the database resolved', () => {
    const block = groupTables([
      standing({ team_id: 'c', team_name: 'Equipo 03', position: 3 }),
      standing({ team_id: 'a', team_name: 'Equipo 01', position: 1 }),
      standing({ team_id: 'b', team_name: 'Equipo 02', position: 2 }),
    ])[0]

    expect(block.rows.map((row) => row.name)).toEqual(['Equipo 01', 'Equipo 02', 'Equipo 03'])
  })

  it('writes the record and the kill difference with its sign', () => {
    const block = groupTables([standing()])[0]

    expect(block.rows[0].display).toBe('2-0')
    expect(block.rows[0].detail).toBe('+18 kills')
    expect(block.rows[0].subtitle).toBe('UNLP')
  })

  it('a team that did not play says so, not "+0 kills"', () => {
    const block = groupTables([standing({ games: 0, wins: 0, losses: 0, kill_diff: 0 })])[0]
    expect(block.rows[0].detail).toBe('sin jugar')
  })

  it('a team on +1 does not say "+1 kills"', () => {
    const block = groupTables([standing({ kill_diff: 1 })])[0]
    expect(block.rows[0].detail).toBe('+1 kill')
  })

  it('teams from several universities show all of them', () => {
    const block = groupTables([standing({ university_tags: ['UNER', 'UADE', 'UNLP'] })])[0]
    expect(block.rows[0].subtitle).toBe('UNER / UADE / UNLP')
  })
})

describe('the batch', () => {
  it('every id in the batch exists in the registry', () => {
    // The list is editorial and written by hand: a mistyped id breaks nothing,
    // that piece simply stops going out. This turns it into an error.
    const known = new Set(STATS.map((stat) => stat.id))
    for (const id of [...BY_MATCHDAY, ...ACCUMULATED]) expect([id, known.has(id)]).toEqual([id, true])
  })

  it('the header says which scope it came from', () => {
    expect(kickerFor(scope(2))).toBe('Fecha 2 · Fase de grupos')
    expect(kickerFor(scope(null))).toBe('Acumulado · Fase de grupos')
  })

  it('with no data there is no piece at all', () => {
    expect(buildPosters(data({ scope: scope(1) }), [])).toEqual([])
  })

  it('the numbers open the batch', () => {
    const posters = buildPosters(data({ records: [record()] }), [])
    expect(posters[0].id).toBe('numeros')
  })

  it('the numbers are not numbered; the rankings and the tables are', () => {
    // Numbering "partidas jugadas, kills totales, la más larga" 1-2-3 would
    // say one is better than the other, and they are not the same thing
    // measured: they are different things.
    const posters = buildPosters(data({ records: [record()] }), [standing()])
    const ordered = new Map(posters.map((poster) => [poster.id, poster.ordered]))

    expect(ordered.get('numeros')).toBe(false)
    expect(ordered.get('tabla-grupo-a')).toBe(true)
  })

  it('the group tables go last, after the rankings', () => {
    const posters = buildPosters(data({ records: [record()] }), [standing()])
    expect(posters.at(-1)!.id).toBe('tabla-grupo-a')
  })

  it('stats with no data stay out instead of going out empty', () => {
    // There are matches but no players or champions loaded: the MVP and the
    // meta have nothing to work with, and no blank card should appear.
    const posters = buildPosters(data({ records: [record()] }), [])
    expect(posters.map((poster) => poster.id)).toEqual(['numeros'])
  })

  it('every piece carries the same scope header', () => {
    const posters = buildPosters(data({ scope: scope(3), records: [record()] }), [standing()])
    expect(new Set(posters.map((poster) => poster.kicker))).toEqual(
      new Set(['Fecha 3 · Fase de grupos']),
    )
  })
})

describe('the raw data', () => {
  const block: StatBlock = {
    id: 'mvp',
    title: 'MVP',
    subtitle: 'Los que más pesaron',
    note: 'Mínimo 1 partida',
    rows: [
      {
        id: 'p1',
        name: 'Zaahen',
        subtitle: 'Equipo 07',
        detail: '6/0/8',
        value: 17.37,
        display: '17.4',
      },
      { id: 'p2', name: 'Ave, "Fénix"', subtitle: null, detail: null, value: 16.4, display: '16.4' },
    ],
  }

  it('the text comes out numbered and with its unit attached', () => {
    expect(toPlainText(block)).toBe(
      [
        'MVP · Los que más pesaron',
        '1. Zaahen — Equipo 07 · 6/0/8 — 17.4',
        '2. Ave, "Fénix" — 16.4',
        '(Mínimo 1 partida)',
      ].join('\n'),
    )
  })

  it('the CSV quotes everything and escapes the inner quotes', () => {
    const lines = toCsv(block).split('\n')

    expect(lines[0]).toBe('"puesto","nombre","contexto","detalle","valor","valor_crudo"')
    expect(lines[1]).toBe('"1","Zaahen","Equipo 07","6/0/8","17.4","17.37"')
    // The comma in the name does not split the cell and the quotes are doubled.
    expect(lines[2]).toBe('"2","Ave, ""Fénix""","","","16.4","16.4"')
  })

  it('the CSV carries the raw number as well as the formatted one', () => {
    // The formatted one is for reading; the raw one is for re-sorting in a
    // spreadsheet, which is what whoever builds the piece on their own does.
    expect(toCsv(block)).toContain('"17.37"')
  })
})

describe('the batch against the real database', () => {
  let db: PGlite
  let tournamentId: string

  /** The same scope, but with the id that exists: `scope()` uses a fake one. */
  const dbScope = (matchday: number | null): StatScope => ({
    tournamentId,
    phase: 'grupos',
    matchday,
  })

  beforeAll(async () => {
    db = await createTestDb()

    const tournament = await db.query<{ id: string }>(
      `insert into public.tournaments (name, slug, format)
       values ('LIDE 2', 'lide-2', 'grupos') returning id`,
    )
    tournamentId = tournament.rows[0].id

    const university = await db.query<{ id: string }>(
      `insert into public.universities (name, tag)
       values ('Universidad Nacional de La Plata', 'UNLP') returning id`,
    )

    const teams = await db.query<{ id: string; name: string }>(
      `insert into public.teams (tournament_id, name, group_label, university_id)
       values ($1, 'Equipo 01', 'Grupo A', $2), ($1, 'Equipo 07', 'Grupo A', $2)
       returning id, name`,
      [tournamentId, university.rows[0].id],
    )
    const uno = teams.rows.find((row) => row.name === 'Equipo 01')!.id
    const siete = teams.rows.find((row) => row.name === 'Equipo 07')!.id

    // Two matchdays, so the total differs from a single matchday's scope.
    for (const matchday of [1, 2]) {
      const fixture = await db.query<{ id: string }>(
        `insert into public.fixtures
           (tournament_id, group_label, matchday, slot, kickoff, team_a_id, team_b_id)
         values ($1, 'Grupo A', $2, 1, '2026-09-05T17:00:00Z', $3, $4)
         returning id`,
        [tournamentId, matchday, uno, siete],
      )

      const matchId = await playScoreboard(db, {
        winner: matchday === 1 ? 'blue' : 'red',
        minutes: matchday === 1 ? 24 : 38,
        blue: ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'SUPPORT'].map((position, index) => ({
          puuid: `a${index}`,
          position,
          champion: `Azul${index}`,
          kills: 4,
          deaths: 1,
          assists: 5,
          damage: 20_000,
        })),
        red: ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'SUPPORT'].map((position, index) => ({
          puuid: `b${index}`,
          position,
          champion: `Rojo${index}`,
          kills: 2,
          deaths: 3,
          assists: 3,
          damage: 14_000,
        })),
      })

      await db.query('select public.assign_match_to_fixture($1, $2, $3)', [
        matchId,
        fixture.rows[0].id,
        uno,
      ])
    }
  }, 60_000)

  afterAll(async () => {
    await db?.close()
  })

  it('one matchday brings the numbers, the MVP, the five and the tables', async () => {
    const posters = buildPosters(
      await loadFromDb(db, dbScope(1)),
      await standingsFromDb(db, tournamentId),
    )
    const ids = posters.map((poster) => poster.id)

    expect(ids).toContain('numeros')
    expect(ids).toContain('mvp')
    expect(ids).toContain('quinteto')
    expect(ids).toContain('tabla-grupo-a')
    // With no bans entered there is no bans piece, which is manual and optional.
    expect(ids).not.toContain('bans')
  })

  it('a single matchday counts one match and the total counts two', async () => {
    const single = buildPosters(await loadFromDb(db, dbScope(1)), [])
    const all = buildPosters(await loadFromDb(db, dbScope(null)), [])

    const matchCount = (posters: ReturnType<typeof buildPosters>) =>
      posters.find((poster) => poster.id === 'numeros')!.block.rows.find((r) => r.id === 'partidas')!
        .value

    expect(matchCount(single)).toBe(1)
    expect(matchCount(all)).toBe(2)
  })

  it('the total adds the records, which a single matchday does not have', async () => {
    const ids = buildPosters(await loadFromDb(db, dbScope(null)), []).map((poster) => poster.id)

    expect(ids).toContain('mas-larga')
    expect(ids).toContain('mas-kills')
  })

  it('the numbers piece picks the longest across both matchdays correctly', async () => {
    const numbers = buildPosters(await loadFromDb(db, dbScope(null)), []).find(
      (poster) => poster.id === 'numeros',
    )!

    expect(numbers.block.rows.find((row) => row.id === 'mas-larga')!.display).toBe('38:00')
    expect(numbers.block.rows.find((row) => row.id === 'mas-corta')!.display).toBe('24:00')
  })

  it('every piece has at least one row: none comes out blank', async () => {
    const posters = buildPosters(
      await loadFromDb(db, dbScope(null)),
      await standingsFromDb(db, tournamentId),
    )

    expect(posters.length).toBeGreaterThan(3)
    for (const poster of posters) expect(poster.block.rows.length).toBeGreaterThan(0)
  })
})
