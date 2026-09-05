import type { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from './helpers/db'


/**
 * What the matchday leaves to sort out.
 *
 * The nicks and the lanes get entered by hand during the week, from whatever
 * people send in. Then it gets played, and the replay is the first hard fact
 * about any of it: somebody changed their nick and did not say so, two of them
 * swapped lanes, a substitute nobody had signed up went in.
 *
 * `roster_review` is that list, per team, and `merge_manual_account()` closes
 * the case that actually loses data - the nick change - by handing the real
 * account the signup its placeholder was holding.
 */

interface ReviewRow {
  team_id: string
  player_id: string
  name: string
  kind: 'nueva' | 'no_jugo' | 'cambio_de_rol'
  games: number
  assigned_role: string | null
  played_role: string | null
  is_placeholder: boolean
  linked: boolean
  suggested_player_id: string | null
  suggested_name: string | null
  suggested_reason: string | null
}

interface MergeResult {
  ok: boolean
  error?: string
  name?: string
  previous?: string
  roster_moved?: boolean
}

describe('roster review', () => {
  let db: PGlite
  let tournamentId: string
  let team01: string
  let team07: string
  const matchup: string[] = []
  const cuenta = new Map<string, string>()

  beforeEach(async () => {
    db = await createTestDb()

    const tournament = await db.query<{ id: string }>(
      `insert into public.tournaments (name, slug) values ('LIDE 2', 'lide-2') returning id`,
    )
    tournamentId = tournament.rows[0].id

    const teams = await db.query<{ id: string; name: string }>(
      `insert into public.teams (tournament_id, name, group_label)
       values ($1, 'Equipo 01', 'Grupo A'), ($1, 'Equipo 07', 'Grupo A')
       returning id, name`,
      [tournamentId],
    )
    team01 = teams.rows.find((r) => r.name === 'Equipo 01')!.id
    team07 = teams.rows.find((r) => r.name === 'Equipo 07')!.id

    for (const matchday of [1, 2]) {
      const { rows } = await db.query<{ id: string }>(
        `insert into public.fixtures
           (tournament_id, group_label, matchday, slot, kickoff, team_a_id, team_b_id)
         values ($1, 'Grupo A', $2, 1, '2026-09-05T17:00:00Z', $3, $4)
         returning id`,
        [tournamentId, matchday, team01, team07],
      )
      matchup.push(rows[0].id)
    }
  }, 60_000)

  afterEach(async () => {
    matchup.length = 0
    cuenta.clear()
    await db?.close()
  })

  /** Types a nick into Team 01's roster, the way the team page does. */
  async function cargar(nick: string, tag: string | null, role?: string) {
    const { rows } = await db.query<{ add_team_account: { player_id: string } }>(
      'select public.add_team_account($1, $2, $3)',
      [team01, nick, tag],
    )
    const playerId = rows[0].add_team_account.player_id
    cuenta.set(nick, playerId)

    if (role) {
      await db.query('select public.assign_team_member_role($1, $2, $3)', [team01, playerId, role])
    }
    return playerId
  }

  /** Signs a legal name up on the sheet and matches it with an account. */
  async function anotar(fullName: string, orderIndex: number, playerId?: string) {
    const { rows } = await db.query<{ id: string }>(
      `insert into public.team_roster (team_id, full_name, order_index)
       values ($1, $2, $3) returning id`,
      [team01, fullName, orderIndex],
    )
    if (playerId) {
      await db.query('select public.assign_roster_account($1, $2)', [rows[0].id, playerId])
    }
    return rows[0].id
  }

  /**
   * Plays a matchday for Team 01 with the given Riot IDs, in lane order.
   *
   * It walks the same steps as `ingest_match()` and in the same order, instead
   * of using the `playScoreboard` helper, because the order is the whole point
   * here: the scoreboard lands first with nothing but PUUIDs, THEN
   * `adopt_manual_accounts()` gives the real PUUID to the hand-typed row that
   * matches, and only then are the remaining accounts created. Creating the
   * `players` rows up front - which is what the shared helper does - skips the
   * adoption and leaves two rows for every nick that was typed in correctly,
   * which is exactly the bug this feature is about.
   */
  async function jugarFecha(matchday: number, nicks: [string, string | null][]) {
    const lanes = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'SUPPORT']
    const { rows } = await db.query<{ id: string }>(
      `insert into public.matches
         (fingerprint, format, game_length_ms, played_at, winning_side, raw_metadata)
       values ($1, 'CLASSIC', 1800000, '2026-09-05T17:00:00Z', 100, '{}'::jsonb)
       returning id`,
      [`fp-review-${matchday}-${Math.random().toString(36).slice(2, 8)}`],
    )
    const matchId = rows[0].id

    for (const [index, [nick, tag]] of nicks.entries()) {
      await db.query(
        `insert into public.match_players
           (match_id, side, participant_index, puuid, riot_game_name, riot_tag_line,
            champion, position, win, raw)
         values ($1, 100, $2, $3, $4, $5, 'Ahri', $6, true, '{}'::jsonb)`,
        [matchId, index, `puuid-${nick}`, nick, tag, lanes[index]],
      )
    }
    for (const [index, puuid] of ['r1', 'r2', 'r3', 'r4', 'r5'].entries()) {
      await db.query(
        `insert into public.match_players
           (match_id, side, participant_index, puuid, riot_game_name,
            champion, position, win, raw)
         values ($1, 200, $2, $3, $3, 'Ahri', $4, false, '{}'::jsonb)`,
        [matchId, 5 + index, `puuid-${matchday}-${puuid}`, lanes[index]],
      )
    }

    // The three lines of ingest_match(), in its order.
    await db.query('select public.adopt_manual_accounts($1)', [matchId])
    await db.query(
      `insert into public.players (puuid, riot_game_name, riot_tag_line)
       select mp.puuid, mp.riot_game_name, mp.riot_tag_line
         from public.match_players mp where mp.match_id = $1
       on conflict (puuid) do update
         set riot_game_name = excluded.riot_game_name,
             riot_tag_line  = coalesce(excluded.riot_tag_line, public.players.riot_tag_line)`,
      [matchId],
    )
    await db.query(
      `update public.match_players mp set player_id = p.id
         from public.players p
        where mp.match_id = $1 and mp.puuid = p.puuid`,
      [matchId],
    )

    await db.query('select public.assign_match_to_fixture($1, $2, $3)', [
      matchId,
      matchup[matchday - 1],
      team01,
    ])
    return matchId
  }

  async function review(teamId = team01): Promise<ReviewRow[]> {
    const { rows } = await db.query<ReviewRow>(
      `select * from public.roster_review where team_id = $1 order by kind, name`,
      [teamId],
    )
    return rows.map((r) => ({ ...r, games: Number(r.games) }))
  }

  async function lineup(teamId = team01) {
    const { rows } = await db.query<{
      slot: number
      role: string | null
      name: string | null
      did_not_play: boolean
    }>(
      `select slot, role, name, did_not_play from public.team_lineup
        where team_id = $1 order by slot`,
      [teamId],
    )
    return rows
  }

  async function merge(placeholder: string, real: string): Promise<MergeResult> {
    const { rows } = await db.query<{ merge_manual_account: MergeResult }>(
      'select public.merge_manual_account($1, $2, $3)',
      [team01, placeholder, real],
    )
    return rows[0].merge_manual_account
  }

  it('before matchday 1 nothing is pending: nobody has played yet', async () => {
    await cargar('Corcho', 'fkc', 'TOP')
    await cargar('Pachu', '777', 'JUNGLE')

    expect(await review()).toEqual([])
    // And the lineup does not accuse anybody of not having played.
    expect((await lineup()).every((r) => r.did_not_play === false)).toBe(true)
  })

  it('a nick that was typed in and did not turn up is flagged once the team plays', async () => {
    await cargar('Corcho', 'fkc', 'TOP')
    await jugarFecha(1, [
      ['Alfa', 'arg'],
      ['Bravo', 'arg'],
      ['Charlie', 'arg'],
      ['Delta', 'arg'],
      ['Eco', 'arg'],
    ])

    const noJugo = (await review()).filter((r) => r.kind === 'no_jugo')
    expect(noJugo).toHaveLength(1)
    expect(noJugo[0]).toMatchObject({
      name: 'Corcho',
      games: 0,
      is_placeholder: true,
      assigned_role: 'TOP',
      played_role: null,
    })

    // And the lineup says so where the nick is drawn.
    const corcho = (await lineup()).find((r) => r.name === 'Corcho')!
    expect(corcho.did_not_play).toBe(true)
    // Top belongs to whoever played it, not to the one who was promised it.
    expect((await lineup()).find((r) => r.slot === 1)!.name).toBe('Alfa')
  })

  it('four of five recognized and one left over: it suggests the pairing', async () => {
    // The week's roster. Four of them play under the nick that was typed in;
    // Corcho shows up as Corchito, which is what a nick change looks like.
    for (const [nick, tag] of [
      ['Corcho', 'fkc'],
      ['Bravo', 'arg'],
      ['Charlie', 'arg'],
      ['Delta', 'arg'],
      ['Eco', 'arg'],
    ] as const) {
      await cargar(nick, tag)
    }

    await jugarFecha(1, [
      ['Corchito', 'zzz'],
      ['Bravo', 'arg'],
      ['Charlie', 'arg'],
      ['Delta', 'arg'],
      ['Eco', 'arg'],
    ])

    const noJugo = (await review()).filter((r) => r.kind === 'no_jugo')
    expect(noJugo).toHaveLength(1)
    expect(noJugo[0]).toMatchObject({
      name: 'Corcho',
      suggested_name: 'Corchito',
      suggested_reason: 'unica',
    })
  })

  it('the #TAG is the strongest hint, and it wins over the arithmetic', async () => {
    await cargar('Corcho', 'fkc')
    await cargar('Pachu', '777')
    for (const [nick, tag] of [
      ['Charlie', 'arg'],
      ['Delta', 'arg'],
      ['Eco', 'arg'],
    ] as const) {
      await cargar(nick, tag)
    }

    // Two did not play and two are new, so the "only one left" rule cannot
    // fire. The tag is what pairs Corcho with Corchito.
    await jugarFecha(1, [
      ['Corchito', 'fkc'],
      ['Otro', 'nnn'],
      ['Charlie', 'arg'],
      ['Delta', 'arg'],
      ['Eco', 'arg'],
    ])

    const noJugo = (await review()).filter((r) => r.kind === 'no_jugo')
    expect(noJugo).toHaveLength(2)

    const corcho = noJugo.find((r) => r.name === 'Corcho')!
    expect(corcho).toMatchObject({ suggested_name: 'Corchito', suggested_reason: 'mismo_tag' })
    // Pachu's tag matches nobody, and the count rules out the arithmetic.
    expect(noJugo.find((r) => r.name === 'Pachu')!.suggested_player_id).toBeNull()
  })

  it('a substitute who played before and sat this one out is never offered for merge', async () => {
    for (const [nick, tag] of [
      ['Alfa', 'arg'],
      ['Bravo', 'arg'],
      ['Charlie', 'arg'],
      ['Delta', 'arg'],
      ['Eco', 'arg'],
    ] as const) {
      await cargar(nick, tag)
    }

    await jugarFecha(1, [
      ['Alfa', 'arg'],
      ['Bravo', 'arg'],
      ['Charlie', 'arg'],
      ['Delta', 'arg'],
      ['Eco', 'arg'],
    ])
    // Eco sits out the second and Foxtrot goes in. Eco has games behind them,
    // so they are a substitute who did not play - not an old nick to absorb.
    await jugarFecha(2, [
      ['Alfa', 'arg'],
      ['Bravo', 'arg'],
      ['Charlie', 'arg'],
      ['Delta', 'arg'],
      ['Foxtrot', 'arg'],
    ])

    expect((await review()).filter((r) => r.kind === 'no_jugo')).toEqual([])
    expect((await lineup()).find((r) => r.name === 'Eco')!.did_not_play).toBe(false)
  })

  it('the merge hands the real account the signup, and the placeholder is gone', async () => {
    const corcho = await cargar('Corcho', 'fkc')
    for (const [nick, tag] of [
      ['Bravo', 'arg'],
      ['Charlie', 'arg'],
      ['Delta', 'arg'],
      ['Eco', 'arg'],
    ] as const) {
      await cargar(nick, tag)
    }
    // The legal name behind the nick: this is what would be lost, and with it
    // which university that person's matches count towards.
    const rosterId = await anotar('Apellido, Nombre', 0, corcho)

    await jugarFecha(1, [
      ['Corchito', 'zzz'],
      ['Bravo', 'arg'],
      ['Charlie', 'arg'],
      ['Delta', 'arg'],
      ['Eco', 'arg'],
    ])

    const sugerido = (await review()).find((r) => r.kind === 'no_jugo')!.suggested_player_id!
    const result = await merge(corcho, sugerido)

    expect(result).toMatchObject({
      ok: true,
      name: 'Corchito',
      previous: 'Corcho',
      roster_moved: true,
    })

    // The signup now points at the account that actually played.
    const { rows: roster } = await db.query<{ player_id: string }>(
      'select player_id from public.team_roster where id = $1',
      [rosterId],
    )
    expect(roster[0].player_id).toBe(sugerido)

    // The placeholder is gone from the roster and from players.
    const { rows: quedan } = await db.query<{ n: number }>(
      'select count(*)::int as n from public.players where id = $1',
      [corcho],
    )
    expect(quedan[0].n).toBe(0)

    // Nothing left pending, and the lineup is the five who played.
    expect((await review()).filter((r) => r.kind === 'no_jugo')).toEqual([])
    const rows = await lineup()
    expect(rows).toHaveLength(5)
    expect(rows.map((r) => r.name)).toContain('Corchito')
    expect(rows.every((r) => r.did_not_play === false)).toBe(true)
  })

  it('it refuses to absorb an account that has already played', async () => {
    for (const [nick, tag] of [
      ['Alfa', 'arg'],
      ['Bravo', 'arg'],
      ['Charlie', 'arg'],
      ['Delta', 'arg'],
      ['Eco', 'arg'],
    ] as const) {
      await cargar(nick, tag)
    }
    await jugarFecha(1, [
      ['Alfa', 'arg'],
      ['Bravo', 'arg'],
      ['Charlie', 'arg'],
      ['Delta', 'arg'],
      ['Eco', 'arg'],
    ])

    const { rows } = await db.query<{ id: string }>(
      `select id from public.players where riot_game_name = 'Alfa'`,
    )
    const { rows: otra } = await db.query<{ id: string }>(
      `select id from public.players where riot_game_name = 'Bravo'`,
    )

    const result = await merge(rows[0].id, otra[0].id)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('ya apareció en un replay')
  })

  it('it refuses when each account is already a different signup', async () => {
    const corcho = await cargar('Corcho', 'fkc')
    for (const [nick, tag] of [
      ['Bravo', 'arg'],
      ['Charlie', 'arg'],
      ['Delta', 'arg'],
      ['Eco', 'arg'],
    ] as const) {
      await cargar(nick, tag)
    }
    await anotar('Apellido, Nombre', 0, corcho)

    await jugarFecha(1, [
      ['Corchito', 'zzz'],
      ['Bravo', 'arg'],
      ['Charlie', 'arg'],
      ['Delta', 'arg'],
      ['Eco', 'arg'],
    ])

    const { rows } = await db.query<{ id: string }>(
      `select id from public.players where riot_game_name = 'Corchito'`,
    )
    await anotar('Otra Persona Distinta', 1, rows[0].id)

    const result = await merge(corcho, rows[0].id)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('inscripto distinto')
  })

  it('it refuses an account from another team', async () => {
    const corcho = await cargar('Corcho', 'fkc')
    const { rows } = await db.query<{ add_team_account: { player_id: string } }>(
      'select public.add_team_account($1, $2, $3)',
      [team07, 'DeOtroLado', 'xyz'],
    )

    const result = await merge(corcho, rows[0].add_team_account.player_id)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('no está en el plantel de este equipo')
  })

  it('a lane that changed is reported, and the lineup already shows the played one', async () => {
    // Charlie was written down as mid and played support.
    const charlie = await cargar('Charlie', 'arg', 'MIDDLE')
    for (const [nick, tag] of [
      ['Alfa', 'arg'],
      ['Bravo', 'arg'],
      ['Delta', 'arg'],
    ] as const) {
      await cargar(nick, tag)
    }

    await jugarFecha(1, [
      ['Alfa', 'arg'],
      ['Bravo', 'arg'],
      ['Eco', 'arg'],
      ['Delta', 'arg'],
      ['Charlie', 'arg'],
    ])

    const cambio = (await review()).filter((r) => r.kind === 'cambio_de_rol')
    expect(cambio).toHaveLength(1)
    expect(cambio[0]).toMatchObject({
      player_id: charlie,
      assigned_role: 'MIDDLE',
      played_role: 'SUPPORT',
    })

    // Nothing to fix: the slot already follows the scoreboard.
    const rows = await lineup()
    expect(rows.find((r) => r.role === 'SUPPORT')!.name).toBe('Charlie')
    expect(rows.find((r) => r.role === 'MIDDLE')!.name).toBe('Eco')
  })

  it('somebody who played and matches no signup is reported as new', async () => {
    await jugarFecha(1, [
      ['Alfa', 'arg'],
      ['Bravo', 'arg'],
      ['Charlie', 'arg'],
      ['Delta', 'arg'],
      ['Eco', 'arg'],
    ])

    const nuevas = (await review()).filter((r) => r.kind === 'nueva')
    expect(nuevas).toHaveLength(5)
    expect(nuevas.every((r) => r.games === 1 && !r.linked)).toBe(true)
  })

  it('without a session the review is empty: it runs on the querier permissions', async () => {
    await cargar('Corcho', 'fkc')
    await jugarFecha(1, [
      ['Alfa', 'arg'],
      ['Bravo', 'arg'],
      ['Charlie', 'arg'],
      ['Delta', 'arg'],
      ['Eco', 'arg'],
    ])

    expect((await review()).length).toBeGreaterThan(0)

    await db.exec('set role anon')
    const { rows } = await db.query('select * from public.roster_review')
    expect(rows).toEqual([])
    await db.exec('reset role')
  })
})
