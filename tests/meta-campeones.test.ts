import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { createTestDb } from './helpers/db'
import { playScoreboard } from './helpers/matches'

/**
 * `champion_meta`: el meta con la dimension de grupo (0021_meta_y_bans.sql).
 *
 * Se arman DOS grupos de dos equipos y DOS fechas, o sea cuatro partidas, que
 * es el minimo para que los cuatro recortes den numeros distintos entre si: si
 * el total y el del grupo dieran lo mismo, el test pasaria aunque la vista
 * ignorara el grupo.
 *
 * Las partidas van enganchadas a su cruce del fixture y no a una etiqueta de
 * texto, que es como resuelve el grupo `match_context` en produccion.
 */

const BLUE = ['b-top', 'b-jgl', 'b-mid', 'b-adc', 'b-sup']
const RED = ['r-top', 'r-jgl', 'r-mid', 'r-adc', 'r-sup']

/** Los cinco del lado azul. Ahri va al mid y es la que se mira en casi todo. */
const AZUL_A = ['Garen', 'Ahri', 'Lux', 'Jinx', 'Thresh']
/** El Grupo B juega Yasuo donde el A juega Ahri: asi Ahri es exclusiva del A. */
const AZUL_B = ['Garen', 'Yasuo', 'Lux', 'Jinx', 'Thresh']
const ROJO = ['Darius', 'Zed', 'Orianna', 'Caitlyn', 'Leona']

interface MetaRow {
  champion: string
  group_label: string | null
  matchday: number | null
  all_groups: boolean
  all_matchdays: boolean
  picks: number
  wins: number
  win_pct: number | null
  bans: number
  matches: number
  matches_with_bans: number
  pick_rate: number | null
  ban_rate: number | null
  presence: number | null
}

describe('meta de campeones', () => {
  let db: PGlite
  let tournamentId: string
  const team = new Map<string, string>()

  /** El recorte pedido, tal cual lo arma `metaFilter` del lado de la app. */
  async function meta(
    grupo: string | null,
    matchday: number | null,
    champion?: string,
  ): Promise<MetaRow[]> {
    const { rows } = await db.query<MetaRow>(
      `select * from public.champion_meta
        where tournament_id = $1
          and phase = 'grupos'
          and all_groups = $2
          and group_label is not distinct from $3
          and all_matchdays = $4
          and matchday is not distinct from $5
          and ($6::text is null or champion = $6)
        order by champion`,
      [
        tournamentId,
        grupo === null,
        grupo,
        matchday === null,
        matchday,
        champion ?? null,
      ],
    )
    return rows
  }

  beforeAll(async () => {
    db = await createTestDb()

    const tournament = await db.query<{ id: string }>(
      `insert into public.tournaments (name, slug, format)
       values ('LIDE 2', 'lide-2', 'grupos') returning id`,
    )
    tournamentId = tournament.rows[0].id

    const stage = new Map<string, string>()
    for (const [index, grupo] of ['Grupo A', 'Grupo B'].entries()) {
      const { rows } = await db.query<{ id: string }>(
        `insert into public.stages (tournament_id, name, kind, order_index)
         values ($1, $2, 'grupos', $3) returning id`,
        [tournamentId, grupo, index],
      )
      stage.set(grupo, rows[0].id)
    }

    for (const [name, grupo] of [
      ['A1', 'Grupo A'],
      ['A2', 'Grupo A'],
      ['B1', 'Grupo B'],
      ['B2', 'Grupo B'],
    ]) {
      const { rows } = await db.query<{ id: string }>(
        `insert into public.teams (tournament_id, name, group_label)
         values ($1, $2, $3) returning id`,
        [tournamentId, name, grupo],
      )
      team.set(name, rows[0].id)
    }

    // Cuatro partidas: cada grupo juega su cruce en las dos fechas.
    for (const matchday of [1, 2]) {
      for (const [grupo, local, visitante, azules] of [
        ['Grupo A', 'A1', 'A2', AZUL_A],
        ['Grupo B', 'B1', 'B2', AZUL_B],
      ] as const) {
        const matchId = await playScoreboard(db, {
          tournamentId,
          blueTeamId: team.get(local),
          redTeamId: team.get(visitante),
          winner: 'blue',
          blue: BLUE.map((puuid, i) => ({
            puuid: `${grupo}-${puuid}`,
            champion: azules[i],
            kills: 3,
          })),
          red: RED.map((puuid, i) => ({
            puuid: `${grupo}-${puuid}`,
            champion: ROJO[i],
            deaths: 3,
          })),
        })

        await db.query(
          `insert into public.fixtures
             (tournament_id, stage_id, group_label, matchday, slot, kickoff,
              team_a_id, team_b_id, match_id)
           values ($1, $2, $3, $4, 1, now(), $5, $6, $7)`,
          [
            tournamentId,
            stage.get(grupo),
            grupo,
            matchday,
            team.get(local),
            team.get(visitante),
            matchId,
          ],
        )
      }
    }
  })

  it('el acumulado cuenta las cuatro partidas', async () => {
    const [garen] = await meta(null, null, 'Garen')
    // Garen se juega en las cuatro, una vez por partida.
    expect(garen.matches).toBe(4)
    expect(garen.picks).toBe(4)
  })

  it('por fecha cuenta solo las dos de esa fecha', async () => {
    const [garen] = await meta(null, 1, 'Garen')
    expect(garen.matches).toBe(2)
    expect(garen.picks).toBe(2)
  })

  it('el recorte por grupo separa lo que jugo cada uno', async () => {
    // Ahri es exclusiva del Grupo A: en el B no existe.
    const enA = await meta('Grupo A', null, 'Ahri')
    const enB = await meta('Grupo B', null, 'Ahri')

    expect(enA).toHaveLength(1)
    expect(enA[0].picks).toBe(2)
    expect(enB).toHaveLength(0)
  })

  it('grupo mas fecha es el cruce de los dos', async () => {
    const [ahri] = await meta('Grupo A', 1, 'Ahri')
    expect(ahri.matches).toBe(1)
    expect(ahri.picks).toBe(1)
  })

  it('pick_rate usa el denominador del recorte y no el del torneo', async () => {
    // Este es el error facil: recortar los picks pero dejar el total de
    // partidas entero. Ahri se jugo 2 veces sobre 4 partidas (0.5), pero
    // dentro de su grupo se jugo en las 2 de 2 (1.0).
    const [total] = await meta(null, null, 'Ahri')
    const [enGrupo] = await meta('Grupo A', null, 'Ahri')

    expect(Number(total.pick_rate)).toBe(0.5)
    expect(Number(enGrupo.pick_rate)).toBe(1)
  })

  it('las dos banderas identifican el recorte sin filas repetidas', async () => {
    for (const [grupo, matchday] of [
      [null, null],
      [null, 1],
      ['Grupo A', null],
      ['Grupo A', 1],
    ] as const) {
      const filas = await meta(grupo, matchday, 'Garen')
      expect(filas).toHaveLength(1)
    }
  })

  it('win_pct sale de los picks del recorte', async () => {
    // El lado azul gana siempre, asi que Ahri (azul) va 2-0 y Zed (rojo) 0-2.
    const [ahri] = await meta(null, null, 'Ahri')
    const [zed] = await meta(null, null, 'Zed')

    expect(Number(ahri.win_pct)).toBe(1)
    expect(Number(zed.win_pct)).toBe(0)
  })

  it('sin ningun draft cargado, ban_rate y presence son null y no 0', async () => {
    // Cero baneos y "no se sabe" son cosas distintas: dibujarlas igual diria
    // que un campeon no se banea nunca cuando en realidad nadie cargo el draft.
    const [garen] = await meta(null, null, 'Garen')
    expect(garen.matches_with_bans).toBe(0)
    expect(garen.ban_rate).toBeNull()
    expect(garen.presence).toBeNull()
  })

  describe('con un draft cargado', () => {
    beforeAll(async () => {
      // Solo la partida de la fecha 1 del Grupo A: asi la cobertura queda
      // parcial y se puede ver que el denominador no es "todas las partidas".
      const { rows } = await db.query<{ match_id: string }>(
        `select match_id from public.match_context
          where tournament_id = $1 and group_label = 'Grupo A' and matchday = 1`,
        [tournamentId],
      )

      await db.query(
        `insert into public.match_bans (match_id, side, champion, order_index)
         values ($1, 100, 'Teemo', 1), ($1, 200, 'Ahri', 1)`,
        [rows[0].match_id],
      )
    })

    it('un campeon solo baneado aparece igual', async () => {
      // Teemo no se jugo nunca. Sin la union de picks y bans en la vista, el
      // meta diria que no existe cuando en realidad es el mas respetado.
      const [teemo] = await meta(null, null, 'Teemo')
      expect(teemo).toBeDefined()
      expect(teemo.picks).toBe(0)
      expect(teemo.bans).toBe(1)
      expect(teemo.win_pct).toBeNull()
    })

    it('las tasas de ban se miden solo sobre las partidas con draft', async () => {
      const [teemo] = await meta(null, null, 'Teemo')
      // Cuatro partidas en el recorte, pero una sola con el draft cargado.
      expect(teemo.matches).toBe(4)
      expect(teemo.matches_with_bans).toBe(1)
      expect(Number(teemo.ban_rate)).toBe(1)
      expect(Number(teemo.presence)).toBe(1)
    })

    it('presence suma los picks de partidas con draft mas los bans', async () => {
      // Ahri se jugo dos veces, pero solo una fue en una partida con draft; y
      // en esa misma partida ademas la banearon del otro lado.
      const [ahri] = await meta(null, null, 'Ahri')
      expect(ahri.picks).toBe(2)
      expect(ahri.bans).toBe(1)
      expect(Number(ahri.presence)).toBe(2)
    })

    it('un grupo sin drafts sigue con las tasas de ban en null', async () => {
      const [garen] = await meta('Grupo B', null, 'Garen')
      expect(garen.matches_with_bans).toBe(0)
      expect(garen.ban_rate).toBeNull()
      expect(garen.presence).toBeNull()
    })

    it('champion_stats no cambio', async () => {
      // La vista vieja sigue devolviendo UNA fila por campeon en el acumulado.
      // Si alguna vez se le agregan los grupos, /estadisticas y las cards de
      // Instagram empiezan a repetir campeones sin tirar ningun error.
      const { rows } = await db.query<{ picks: number }>(
        `select picks from public.champion_stats
          where tournament_id = $1 and phase = 'grupos' and is_total and champion = 'Garen'`,
        [tournamentId],
      )

      expect(rows).toHaveLength(1)
      expect(rows[0].picks).toBe(4)
    })
  })
})
