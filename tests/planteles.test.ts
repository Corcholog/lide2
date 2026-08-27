import type { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from './helpers/db'
import { playScoreboard } from './helpers/matches'

/**
 * Emparejar inscriptos con cuentas de Riot.
 *
 * El caso modelo es el Equipo 15 de verdad: cinco personas de tres
 * universidades. Sin emparejar, las cinco cuentan para UNER (la principal del
 * equipo) y UADE se queda sin nadie. Con el emparejado, cada una va a la suya.
 */

describe('planteles', () => {
  let db: PGlite
  let tournamentId: string
  let equipo15: string
  let equipo01: string
  let cruce: string
  const university = new Map<string, string>()
  const roster = new Map<string, string>()

  beforeEach(async () => {
    db = await createTestDb()

    const tournament = await db.query<{ id: string }>(
      `insert into public.tournaments (name, slug) values ('LIDE 2', 'lide-2') returning id`,
    )
    tournamentId = tournament.rows[0].id

    for (const [tag, name] of [
      ['UNER', 'Universidad Nacional de Entre Rios'],
      ['UADE', 'Universidad Argentina de la Empresa'],
      ['UNLP', 'Universidad Nacional de La Plata'],
    ]) {
      const { rows } = await db.query<{ id: string }>(
        `insert into public.universities (name, tag) values ($1, $2) returning id`,
        [name, tag],
      )
      university.set(tag, rows[0].id)
    }

    const teams = await db.query<{ id: string; name: string }>(
      `insert into public.teams (tournament_id, name, group_label, university_id)
       values ($1, 'Equipo 15', 'Grupo A', $2), ($1, 'Equipo 01', 'Grupo A', $3)
       returning id, name`,
      [tournamentId, university.get('UNER'), university.get('UNLP')],
    )
    equipo15 = teams.rows.find((r) => r.name === 'Equipo 15')!.id
    equipo01 = teams.rows.find((r) => r.name === 'Equipo 01')!.id

    // El plantel real del 15, con la universidad que declaro cada uno.
    const inscriptos: [string, string][] = [
      ['Denis Chang', 'UNER'],
      ['Alexis Maximiliano Costas', 'UNER'],
      ['Maria Teresita pereyra potel', 'UNER'],
      ['Fernando Luis Guzman Rivadineira', 'UNLP'],
      ['Gabriel Pareja', 'UADE'],
    ]

    for (const [index, [name, tag]] of inscriptos.entries()) {
      const { rows } = await db.query<{ id: string }>(
        `insert into public.team_roster (team_id, full_name, university_id, order_index)
         values ($1, $2, $3, $4) returning id`,
        [equipo15, name, university.get(tag), index],
      )
      roster.set(name, rows[0].id)
    }

    for (const [index, name] of ['Uno', 'Dos', 'Tres', 'Cuatro', 'Cinco'].entries()) {
      await db.query(
        `insert into public.team_roster (team_id, full_name, university_id, order_index)
         values ($1, $2, $3, $4)`,
        [equipo01, name, university.get('UNLP'), index],
      )
    }

    const fixtures = await db.query<{ id: string }>(
      `insert into public.fixtures
         (tournament_id, group_label, matchday, slot, kickoff, team_a_id, team_b_id)
       values ($1, 'Grupo A', 1, 1, '2026-09-05T17:00:00Z', $2, $3)
       returning id`,
      [tournamentId, equipo15, equipo01],
    )
    cruce = fixtures.rows[0].id
  }, 60_000)

  afterEach(async () => {
    await db?.close()
  })

  /** Los cinco del 15 juegan, con estos Riot IDs. */
  async function jugar(nicks: [string, string | null][]): Promise<string> {
    const matchId = await playScoreboard(db, {
      winner: 'blue',
      blue: nicks.map(([name], i) => ({ puuid: `p-${i}-${name}`, kills: 2, deaths: 1, assists: 3 })),
      red: ['x1', 'x2', 'x3', 'x4', 'x5'].map((puuid) => ({ puuid, kills: 1, deaths: 2 })),
    })

    for (const [index, [name, tag]] of nicks.entries()) {
      await db.query(
        `update public.players set riot_game_name = $1, riot_tag_line = $2 where puuid = $3`,
        [name, tag, `p-${index}-${name}`],
      )
    }

    return matchId
  }

  async function asignar(matchId: string) {
    const { rows } = await db.query<{ assign_match_to_fixture: { matched: number } }>(
      'select public.assign_match_to_fixture($1, $2, $3)',
      [matchId, cruce, equipo15],
    )
    return rows[0].assign_match_to_fixture
  }

  async function declarar(name: string, gameName: string, tag: string | null) {
    await db.query(
      `update public.team_roster set riot_game_name = $1, riot_tag_line = $2 where id = $3`,
      [gameName, tag, roster.get(name)],
    )
  }

  it('el Riot ID declarado se puede cargar antes de que jueguen y se resuelve solo', async () => {
    await declarar('Denis Chang', 'DenisChang', 'LAN')
    await declarar('Gabriel Pareja', 'ElGabo', 'ARG1')

    // Todavia no jugo nadie: no hay nada que emparejar.
    const antes = await db.query<{ link_roster_accounts: number }>(
      'select public.link_roster_accounts(null)',
    )
    expect(Number(antes.rows[0].link_roster_accounts)).toBe(0)

    const matchId = await jugar([
      ['DenisChang', 'LAN'],
      ['Alexis', 'LAS'],
      ['Tere', 'LAN'],
      ['Fer', 'LAN'],
      ['ElGabo', 'ARG1'],
    ])

    // Asignar el cruce es lo que dispara el emparejado.
    const result = await asignar(matchId)
    expect(result.matched).toBe(2)

    const { rows } = await db.query<{ full_name: string; linked_game_name: string }>(
      `select full_name, linked_game_name from public.roster_status
        where player_id is not null order by full_name`,
    )
    expect(rows.map((r) => [r.full_name, r.linked_game_name])).toEqual([
      ['Denis Chang', 'DenisChang'],
      ['Gabriel Pareja', 'ElGabo'],
    ])
  })

  it('emparejar mueve las estadisticas a la universidad correcta', async () => {
    await declarar('Gabriel Pareja', 'ElGabo', 'ARG1')

    const matchId = await jugar([
      ['DenisChang', 'LAN'],
      ['Alexis', 'LAS'],
      ['Tere', 'LAN'],
      ['Fer', 'LAN'],
      ['ElGabo', 'ARG1'],
    ])
    await asignar(matchId)

    const { rows } = await db.query<{ university_tag: string; players: string }>(
      `select university_tag, players from public.university_totals
        where tournament_id = $1 and is_total order by university_tag`,
      [tournamentId],
    )

    const byTag = new Map(rows.map((r) => [r.university_tag, Number(r.players)]))
    // Sin el emparejado, UADE no existiria y UNER tendria los cinco.
    expect(byTag.get('UADE')).toBe(1)
    expect(byTag.get('UNER')).toBe(4)
  })

  it('sin tag se busca solo entre las cuentas del equipo', async () => {
    await declarar('Denis Chang', 'DenisChang', null)

    const matchId = await jugar([
      ['DenisChang', 'LAN'],
      ['Alexis', 'LAS'],
      ['Tere', 'LAN'],
      ['Fer', 'LAN'],
      ['ElGabo', 'ARG1'],
    ])
    const result = await asignar(matchId)

    expect(result.matched).toBe(1)
  })

  it('el nick declarado que nadie uso no empareja a nadie', async () => {
    await declarar('Denis Chang', 'NickViejo', 'LAN')

    const matchId = await jugar([
      ['DenisChang', 'LAN'],
      ['Alexis', 'LAS'],
      ['Tere', 'LAN'],
      ['Fer', 'LAN'],
      ['ElGabo', 'ARG1'],
    ])
    const result = await asignar(matchId)

    expect(result.matched).toBe(0)

    // Y queda a la vista en el panel: cinco cuentas del equipo sin dueno.
    const { rows } = await db.query<{ n: string }>(
      `select count(*) as n from public.team_accounts where team_id = $1 and not linked`,
      [equipo15],
    )
    expect(Number(rows[0].n)).toBe(5)
  })

  it('dos inscriptos no se pueden llevar la misma cuenta', async () => {
    await declarar('Denis Chang', 'DenisChang', 'LAN')
    await declarar('Gabriel Pareja', 'DenisChang', 'LAN')

    const matchId = await jugar([
      ['DenisChang', 'LAN'],
      ['Alexis', 'LAS'],
      ['Tere', 'LAN'],
      ['Fer', 'LAN'],
      ['ElGabo', 'ARG1'],
    ])
    const result = await asignar(matchId)

    // Se lleva la cuenta el primero; el segundo queda para que lo mire alguien.
    expect(result.matched).toBe(1)
  })

  it('lo ya emparejado no se vuelve a tocar', async () => {
    await declarar('Denis Chang', 'DenisChang', 'LAN')

    const matchId = await jugar([
      ['DenisChang', 'LAN'],
      ['Alexis', 'LAS'],
      ['Tere', 'LAN'],
      ['Fer', 'LAN'],
      ['ElGabo', 'ARG1'],
    ])
    await asignar(matchId)

    const otra = await db.query<{ link_roster_accounts: number }>(
      'select public.link_roster_accounts(null)',
    )
    expect(Number(otra.rows[0].link_roster_accounts)).toBe(0)
  })
})
