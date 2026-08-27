import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ACUMULADO, buildPosters, kickerFor, POR_FECHA } from '@/lib/cards/batch'
import { toCsv, toPlainText } from '@/lib/cards/export'
import { groupTables, matchdayNumbers } from '@/lib/cards/summary'
import { STATS } from '@/lib/stats/registry'
import type { StatBlock, StatScope, StatsData } from '@/lib/stats/types'
import type { GroupStandingRow, MatchRecordRow } from '@/types/db'
import { createTestDb } from './helpers/db'
import { playScoreboard } from './helpers/matches'

/**
 * El lote de piezas.
 *
 * Casi todo lo de acá son funciones puras sobre lo que devuelve la base, así
 * que se prueban sin base. Al final hay un recorrido entero contra Postgres
 * embebido, que es lo único que verifica que las vistas y el lote hablen el
 * mismo idioma: un filtro mal puesto devuelve cero filas sin dar error, y sin
 * este test el síntoma sería una página vacía el día de la primera fecha.
 */

/**
 * Las diferencias de transporte entre PGlite y PostgREST.
 *
 * PGlite habla el protocolo de Postgres, como node-postgres: `numeric` y
 * `bigint` llegan como texto (no entran en un `number` sin perder precisión) y
 * las fechas llegan como `Date`. PostgREST devuelve JSON: números y texto ISO.
 *
 * El motor de estadísticas hace cuentas con esos valores (`row.kda.toFixed`,
 * `played_at.localeCompare`), así que sin esto el test falla por el transporte
 * y no por el código, que es la peor clase de test: rojo cuando todo está bien.
 *
 * Las fechas quedan como el texto crudo del protocolo en vez de ISO. Alcanza
 * para lo único que se hace con ellas acá, que es desempatar comparando.
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
 * Lo mismo que `loadStats`, contra PGlite.
 *
 * Se repiten los filtros en vez de importar la función porque esa habla
 * PostgREST. Si acá y allá se separan, el test del final lo muestra: el lote
 * saldría vacío.
 */
async function loadFromDb(db: PGlite, scope: StatScope): Promise<StatsData> {
  const total = scope.matchday === null
  const where = total
    ? 'tournament_id = $1 and phase = $2 and is_total'
    : 'tournament_id = $1 and phase = $2 and not is_total and matchday = $3'
  const params = total
    ? [scope.tournamentId, scope.phase]
    : [scope.tournamentId, scope.phase, scope.matchday]

  // De a una y no con Promise.all: PGlite es una sola conexión y las consultas
  // concurrentes se traban sin dar error. En producción son seis viajes en
  // paralelo a Postgres, que sí aguanta.
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

describe('los números de la fecha', () => {
  it('sin partidas no hay pieza', () => {
    expect(matchdayNumbers(data())).toBeNull()
  })

  it('cuenta partidas y kills, y saca el promedio', () => {
    const block = matchdayNumbers(
      data({ records: [record(), record({ match_id: 'm2', total_kills: 30 })] }),
    )!

    const partidas = block.rows.find((row) => row.id === 'partidas')!
    const kills = block.rows.find((row) => row.id === 'kills')!

    expect(partidas.value).toBe(2)
    expect(kills.value).toBe(50)
    expect(kills.detail).toBe('25.0 por partida')
  })

  it('la más larga y la más corta, con quiénes jugaron', () => {
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

  it('con una sola partida no repite la misma como más larga y más corta', () => {
    const block = matchdayNumbers(data({ records: [record()] }))!
    const ids = block.rows.map((row) => row.id)

    expect(ids).toContain('mas-larga')
    expect(ids).not.toContain('mas-corta')
  })

  it('la más pareja se mide por oro, no por kills', () => {
    // La paliza en kills está pareja en oro; la otra se ganó por oro de largo.
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

  it('ignora las partidas sin oro para elegir la más pareja', () => {
    // Un replay viejo puede no traer oro: cero no es "estuvo parejísimo".
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

  it('la más pareja muestra el oro y no el marcador', () => {
    // Si mostrara las kills la pieza se contradice sola: la más pareja de la
    // fecha 1 de verdad terminó 44-25, con 1,4k de diferencia de oro.
    const block = matchdayNumbers(
      data({ records: [record({ blue_gold: 55_000, red_gold: 50_000 })] }),
    )!
    expect(block.rows.find((row) => row.id === 'mas-pareja')!.detail).toBe('55.0k vs 50.0k')
  })

  it('el acumulado no se llama "la jornada", que son tres', () => {
    expect(matchdayNumbers(data({ records: [record()] }))!.subtitle).toBe('Lo que dejó la jornada')
    expect(matchdayNumbers(data({ scope: scope(null), records: [record()] }))!.subtitle).toBe(
      'Lo que va de la fase',
    )
  })
})

describe('las tablas de grupo', () => {
  it('una pieza por grupo, en orden alfabético', () => {
    const blocks = groupTables([
      standing({ group_label: 'Grupo B', team_id: 'x', team_name: 'Equipo 09' }),
      standing({ group_label: 'Grupo A' }),
    ])

    expect(blocks.map((block) => block.title)).toEqual(['Grupo A', 'Grupo B'])
    expect(blocks[0].id).toBe('tabla-grupo-a')
  })

  it('respeta el orden de posición que resolvió la base', () => {
    const block = groupTables([
      standing({ team_id: 'c', team_name: 'Equipo 03', position: 3 }),
      standing({ team_id: 'a', team_name: 'Equipo 01', position: 1 }),
      standing({ team_id: 'b', team_name: 'Equipo 02', position: 2 }),
    ])[0]

    expect(block.rows.map((row) => row.name)).toEqual(['Equipo 01', 'Equipo 02', 'Equipo 03'])
  })

  it('escribe el récord y la diferencia de kills con signo', () => {
    const block = groupTables([standing()])[0]

    expect(block.rows[0].display).toBe('2-0')
    expect(block.rows[0].detail).toBe('+18 kills')
    expect(block.rows[0].subtitle).toBe('UNLP')
  })

  it('un equipo que no jugó dice que no jugó, no "+0 kills"', () => {
    const block = groupTables([standing({ games: 0, wins: 0, losses: 0, kill_diff: 0 })])[0]
    expect(block.rows[0].detail).toBe('sin jugar')
  })

  it('un equipo a +1 no dice "+1 kills"', () => {
    const block = groupTables([standing({ kill_diff: 1 })])[0]
    expect(block.rows[0].detail).toBe('+1 kill')
  })

  it('los equipos de varias universidades las muestran todas', () => {
    const block = groupTables([standing({ university_tags: ['UNER', 'UADE', 'UNLP'] })])[0]
    expect(block.rows[0].subtitle).toBe('UNER / UADE / UNLP')
  })
})

describe('el lote', () => {
  it('todos los ids del lote existen en el registro', () => {
    // La lista es editorial y se escribe a mano: un id mal tipeado no rompe
    // nada, simplemente deja de salir esa pieza. Esto lo convierte en un error.
    const known = new Set(STATS.map((stat) => stat.id))
    for (const id of [...POR_FECHA, ...ACUMULADO]) expect([id, known.has(id)]).toEqual([id, true])
  })

  it('el encabezado dice de qué recorte salió', () => {
    expect(kickerFor(scope(2))).toBe('Fecha 2 · Fase de grupos')
    expect(kickerFor(scope(null))).toBe('Acumulado · Fase de grupos')
  })

  it('sin datos no hay ninguna pieza', () => {
    expect(buildPosters(data({ scope: scope(1) }), [])).toEqual([])
  })

  it('los números abren el lote', () => {
    const posters = buildPosters(data({ records: [record()] }), [])
    expect(posters[0].id).toBe('numeros')
  })

  it('los números no van numerados; los rankings y las tablas sí', () => {
    // Numerar "partidas jugadas, kills totales, la más larga" 1-2-3 diría que
    // una es mejor que la otra, y no son lo mismo medido: son cosas distintas.
    const posters = buildPosters(data({ records: [record()] }), [standing()])
    const ordered = new Map(posters.map((poster) => [poster.id, poster.ordered]))

    expect(ordered.get('numeros')).toBe(false)
    expect(ordered.get('tabla-grupo-a')).toBe(true)
  })

  it('las tablas de grupo van al final, después de los rankings', () => {
    const posters = buildPosters(data({ records: [record()] }), [standing()])
    expect(posters.at(-1)!.id).toBe('tabla-grupo-a')
  })

  it('las estadísticas sin datos quedan afuera en vez de salir vacías', () => {
    // Hay partidas pero no hay jugadores ni campeones cargados: el MVP y el
    // meta no tienen con qué, y no tiene que aparecer una card en blanco.
    const posters = buildPosters(data({ records: [record()] }), [])
    expect(posters.map((poster) => poster.id)).toEqual(['numeros'])
  })

  it('todas las piezas llevan el mismo encabezado del recorte', () => {
    const posters = buildPosters(data({ scope: scope(3), records: [record()] }), [standing()])
    expect(new Set(posters.map((poster) => poster.kicker))).toEqual(
      new Set(['Fecha 3 · Fase de grupos']),
    )
  })
})

describe('los datos crudos', () => {
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

  it('el texto sale numerado y con la unidad puesta', () => {
    expect(toPlainText(block)).toBe(
      [
        'MVP · Los que más pesaron',
        '1. Zaahen — Equipo 07 · 6/0/8 — 17.4',
        '2. Ave, "Fénix" — 16.4',
        '(Mínimo 1 partida)',
      ].join('\n'),
    )
  })

  it('el CSV entrecomilla todo y escapa las comillas de adentro', () => {
    const lines = toCsv(block).split('\n')

    expect(lines[0]).toBe('"puesto","nombre","contexto","detalle","valor","valor_crudo"')
    expect(lines[1]).toBe('"1","Zaahen","Equipo 07","6/0/8","17.4","17.37"')
    // La coma del nombre no parte la celda y las comillas van dobladas.
    expect(lines[2]).toBe('"2","Ave, ""Fénix""","","","16.4","16.4"')
  })

  it('el CSV lleva el número crudo además del formateado', () => {
    // El formateado es para leer; el crudo es para volver a ordenar en una
    // planilla, que es lo que hace el que arma la pieza por su cuenta.
    expect(toCsv(block)).toContain('"17.37"')
  })
})

describe('el lote contra la base de verdad', () => {
  let db: PGlite
  let tournamentId: string

  /** El mismo recorte, pero con el id que existe: `scope()` usa uno de mentira. */
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

    // Dos fechas, para que el acumulado sea distinto del recorte de una.
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

  it('una fecha trae los números, el MVP, el quinteto y las tablas', async () => {
    const posters = buildPosters(
      await loadFromDb(db, dbScope(1)),
      await standingsFromDb(db, tournamentId),
    )
    const ids = posters.map((poster) => poster.id)

    expect(ids).toContain('numeros')
    expect(ids).toContain('mvp')
    expect(ids).toContain('quinteto')
    expect(ids).toContain('tabla-grupo-a')
    // Sin bans cargados no hay pieza de bans, que es carga manual y opcional.
    expect(ids).not.toContain('bans')
  })

  it('el recorte de una fecha cuenta una partida y el acumulado dos', async () => {
    const una = buildPosters(await loadFromDb(db, dbScope(1)), [])
    const todo = buildPosters(await loadFromDb(db, dbScope(null)), [])

    const partidas = (posters: ReturnType<typeof buildPosters>) =>
      posters.find((poster) => poster.id === 'numeros')!.block.rows.find((r) => r.id === 'partidas')!
        .value

    expect(partidas(una)).toBe(1)
    expect(partidas(todo)).toBe(2)
  })

  it('el acumulado suma los récords, que una sola fecha no tiene', async () => {
    const ids = buildPosters(await loadFromDb(db, dbScope(null)), []).map((poster) => poster.id)

    expect(ids).toContain('mas-larga')
    expect(ids).toContain('mas-kills')
  })

  it('la pieza de los números elige bien la más larga entre las dos fechas', async () => {
    const numeros = buildPosters(await loadFromDb(db, dbScope(null)), []).find(
      (poster) => poster.id === 'numeros',
    )!

    expect(numeros.block.rows.find((row) => row.id === 'mas-larga')!.display).toBe('38:00')
    expect(numeros.block.rows.find((row) => row.id === 'mas-corta')!.display).toBe('24:00')
  })

  it('cada pieza tiene al menos una fila: ninguna sale en blanco', async () => {
    const posters = buildPosters(
      await loadFromDb(db, dbScope(null)),
      await standingsFromDb(db, tournamentId),
    )

    expect(posters.length).toBeGreaterThan(3)
    for (const poster of posters) expect(poster.block.rows.length).toBeGreaterThan(0)
  })
})
