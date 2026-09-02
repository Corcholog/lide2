import type { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from './helpers/db'
import { playScoreboard } from './helpers/matches'

/**
 * Matching signups with Riot accounts.
 *
 * The model case is the real Team 15: five people from three universities.
 * Unmatched, all five count towards UNER (the team's main one) and UADE is left
 * with nobody. Matched, each goes to their own.
 */

describe('roster matching', () => {
  let db: PGlite
  let tournamentId: string
  let team15: string
  let team01: string
  let matchup: string
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
    team15 = teams.rows.find((r) => r.name === 'Equipo 15')!.id
    team01 = teams.rows.find((r) => r.name === 'Equipo 01')!.id

    // Team 15's real roster, with the university each one declared.
    const signups: [string, string][] = [
      ['Denis Chang', 'UNER'],
      ['Alexis Maximiliano Costas', 'UNER'],
      ['Maria Teresita pereyra potel', 'UNER'],
      ['Fernando Luis Guzman Rivadineira', 'UNLP'],
      ['Gabriel Pareja', 'UADE'],
    ]

    for (const [index, [name, tag]] of signups.entries()) {
      const { rows } = await db.query<{ id: string }>(
        `insert into public.team_roster (team_id, full_name, university_id, order_index)
         values ($1, $2, $3, $4) returning id`,
        [team15, name, university.get(tag), index],
      )
      roster.set(name, rows[0].id)
    }

    for (const [index, name] of ['Uno', 'Dos', 'Tres', 'Cuatro', 'Cinco'].entries()) {
      await db.query(
        `insert into public.team_roster (team_id, full_name, university_id, order_index)
         values ($1, $2, $3, $4)`,
        [team01, name, university.get('UNLP'), index],
      )
    }

    const fixtures = await db.query<{ id: string }>(
      `insert into public.fixtures
         (tournament_id, group_label, matchday, slot, kickoff, team_a_id, team_b_id)
       values ($1, 'Grupo A', 1, 1, '2026-09-05T17:00:00Z', $2, $3)
       returning id`,
      [tournamentId, team15, team01],
    )
    matchup = fixtures.rows[0].id
  }, 60_000)

  afterEach(async () => {
    await db?.close()
  })

  /** Team 15's five play, with these Riot IDs. */
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

  async function assign(matchId: string) {
    const { rows } = await db.query<{ assign_match_to_fixture: { matched: number } }>(
      'select public.assign_match_to_fixture($1, $2, $3)',
      [matchId, matchup, team15],
    )
    return rows[0].assign_match_to_fixture
  }

  async function declarar(name: string, gameName: string, tag: string | null) {
    await db.query(
      `update public.team_roster set riot_game_name = $1, riot_tag_line = $2 where id = $3`,
      [gameName, tag, roster.get(name)],
    )
  }

  it('the declared Riot ID can be entered before they play and resolves itself', async () => {
    await declarar('Denis Chang', 'DenisChang', 'LAN')
    await declarar('Gabriel Pareja', 'ElGabo', 'ARG1')

    // Nobody has played yet: there is nothing to match.
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

    // Assigning the matchup is what triggers the matching.
    const result = await assign(matchId)
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

  it('matching moves the stats to the right university', async () => {
    await declarar('Gabriel Pareja', 'ElGabo', 'ARG1')

    const matchId = await jugar([
      ['DenisChang', 'LAN'],
      ['Alexis', 'LAS'],
      ['Tere', 'LAN'],
      ['Fer', 'LAN'],
      ['ElGabo', 'ARG1'],
    ])
    await assign(matchId)

    const { rows } = await db.query<{ university_tag: string; players: string }>(
      `select university_tag, players from public.university_totals
        where tournament_id = $1 and is_total order by university_tag`,
      [tournamentId],
    )

    const byTag = new Map(rows.map((r) => [r.university_tag, Number(r.players)]))
    // Without the matching, UADE would not exist and UNER would have all five.
    expect(byTag.get('UADE')).toBe(1)
    expect(byTag.get('UNER')).toBe(4)
  })

  it("with no tag it searches only among the team's accounts", async () => {
    await declarar('Denis Chang', 'DenisChang', null)

    const matchId = await jugar([
      ['DenisChang', 'LAN'],
      ['Alexis', 'LAS'],
      ['Tere', 'LAN'],
      ['Fer', 'LAN'],
      ['ElGabo', 'ARG1'],
    ])
    const result = await assign(matchId)

    expect(result.matched).toBe(1)
  })

  it('a declared nick nobody used matches nobody', async () => {
    await declarar('Denis Chang', 'NickViejo', 'LAN')

    const matchId = await jugar([
      ['DenisChang', 'LAN'],
      ['Alexis', 'LAS'],
      ['Tere', 'LAN'],
      ['Fer', 'LAN'],
      ['ElGabo', 'ARG1'],
    ])
    const result = await assign(matchId)

    expect(result.matched).toBe(0)

    // And it stays visible in the panel: five team accounts with no owner.
    const { rows } = await db.query<{ n: string }>(
      `select count(*) as n from public.team_accounts where team_id = $1 and not linked`,
      [team15],
    )
    expect(Number(rows[0].n)).toBe(5)
  })

  it('two signups cannot take the same account', async () => {
    await declarar('Denis Chang', 'DenisChang', 'LAN')
    await declarar('Gabriel Pareja', 'DenisChang', 'LAN')

    const matchId = await jugar([
      ['DenisChang', 'LAN'],
      ['Alexis', 'LAS'],
      ['Tere', 'LAN'],
      ['Fer', 'LAN'],
      ['ElGabo', 'ARG1'],
    ])
    const result = await assign(matchId)

    // The first takes the account; the second is left for somebody to look at.
    expect(result.matched).toBe(1)
  })

  it('what is already matched is not touched again', async () => {
    await declarar('Denis Chang', 'DenisChang', 'LAN')

    const matchId = await jugar([
      ['DenisChang', 'LAN'],
      ['Alexis', 'LAS'],
      ['Tere', 'LAN'],
      ['Fer', 'LAN'],
      ['ElGabo', 'ARG1'],
    ])
    await assign(matchId)

    const otra = await db.query<{ link_roster_accounts: number }>(
      'select public.link_roster_accounts(null)',
    )
    expect(Number(otra.rows[0].link_roster_accounts)).toBe(0)
  })
})
