import type { PGlite } from '@electric-sql/pglite'

/**
 * Arma una partida a mano: la fila de `matches` y un jugador por lado.
 *
 * Un jugador por lado alcanza porque las vistas suman por lado, y ahorra las 10
 * filas de un scoreboard real en tests que no miran stats individuales. Para
 * ingesta de verdad estan los fixtures .rofl.
 */
export interface PlayMatchOptions {
  blueTeamId?: string | null
  redTeamId?: string | null
  winner: 'blue' | 'red'
  blueKills?: number
  redKills?: number
  stageLabel?: string | null
  roundLabel?: string | null
  playedAt?: string
  tournamentId?: string | null
  seriesId?: string | null
  gameNumber?: number | null
  minutes?: number
}

let sequence = 0

export async function playMatch(db: PGlite, options: PlayMatchOptions): Promise<string> {
  const {
    blueTeamId = null,
    redTeamId = null,
    winner,
    blueKills = 10,
    redKills = 10,
    stageLabel = null,
    roundLabel = null,
    playedAt = '2026-09-05T22:00:00Z',
    tournamentId = null,
    seriesId = null,
    gameNumber = null,
    minutes = 30,
  } = options

  const winningSide = winner === 'blue' ? 100 : 200
  sequence++

  const { rows } = await db.query<{ id: string }>(
    `insert into public.matches
       (fingerprint, format, game_length_ms, played_at, winning_side, blue_team_id, red_team_id,
        stage_label, round_label, tournament_id, series_id, game_number, raw_metadata)
     values ($1, 'CLASSIC', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, '{}'::jsonb)
     returning id`,
    [
      `fp-${sequence}-${Math.random().toString(36).slice(2, 8)}`,
      minutes * 60_000,
      playedAt,
      winningSide,
      blueTeamId,
      redTeamId,
      stageLabel,
      roundLabel,
      tournamentId,
      seriesId,
      gameNumber,
    ],
  )

  const matchId = rows[0].id

  for (const [side, kills] of [
    [100, blueKills],
    [200, redKills],
  ] as const) {
    await db.query(
      `insert into public.match_players
         (match_id, side, participant_index, puuid, champion, win, kills, gold_earned, team_id, raw)
       values ($1, $2, $3, $4, 'Ahri', $5, $6, $7, $8, '{}'::jsonb)`,
      [
        matchId,
        side,
        side,
        `puuid-${sequence}-${side}`,
        side === winningSide,
        kills,
        kills * 1000,
        side === 100 ? blueTeamId : redTeamId,
      ],
    )
  }

  return matchId
}

/**
 * Una linea del scoreboard: un jugador con sus numeros.
 *
 * Todo tiene default porque cada test mira dos o tres columnas y llenar diez
 * campos por jugador para probar el ranking de vision es puro ruido.
 */
export interface PlayerLine {
  puuid: string
  champion?: string
  position?: string
  kills?: number
  deaths?: number
  assists?: number
  damage?: number
  gold?: number
  cs?: number
  vision?: number
  mitigated?: number
  wardsKilled?: number
  spree?: number
  pentas?: number
}

export interface ScoreboardOptions {
  blueTeamId?: string | null
  redTeamId?: string | null
  winner: 'blue' | 'red'
  blue: PlayerLine[]
  red: PlayerLine[]
  stageLabel?: string | null
  roundLabel?: string | null
  playedAt?: string
  tournamentId?: string | null
  seriesId?: string | null
  minutes?: number
}

const POSITIONS = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY']

/**
 * Arma una partida con el scoreboard entero, como la deja la ingesta.
 *
 * A diferencia de playMatch (un jugador por lado, que alcanza para las vistas
 * que suman por lado), esto hace falta para todo lo que mira al jugador: MVP,
 * participacion en kills, rankings individuales y atribucion por universidad.
 *
 * Crea tambien la fila de `players` y la enlaza, que es lo que hace
 * ingest_match(): sin eso, player_id queda null y la universidad de una persona
 * no se puede resolver.
 */
export async function playScoreboard(db: PGlite, options: ScoreboardOptions): Promise<string> {
  const {
    blueTeamId = null,
    redTeamId = null,
    winner,
    blue,
    red,
    stageLabel = null,
    roundLabel = null,
    playedAt = '2026-09-05T17:00:00Z',
    tournamentId = null,
    seriesId = null,
    minutes = 30,
  } = options

  const winningSide = winner === 'blue' ? 100 : 200
  sequence++

  const { rows } = await db.query<{ id: string }>(
    `insert into public.matches
       (fingerprint, format, game_length_ms, played_at, winning_side, blue_team_id, red_team_id,
        stage_label, round_label, tournament_id, series_id, raw_metadata)
     values ($1, 'CLASSIC', $2, $3, $4, $5, $6, $7, $8, $9, $10, '{}'::jsonb)
     returning id`,
    [
      `fp-sb-${sequence}-${Math.random().toString(36).slice(2, 8)}`,
      minutes * 60_000,
      playedAt,
      winningSide,
      blueTeamId,
      redTeamId,
      stageLabel,
      roundLabel,
      tournamentId,
      seriesId,
    ],
  )

  const matchId = rows[0].id

  for (const [side, lines, teamId] of [
    [100, blue, blueTeamId],
    [200, red, redTeamId],
  ] as const) {
    for (const [index, line] of lines.entries()) {
      const player = await db.query<{ id: string }>(
        `insert into public.players (puuid, riot_game_name)
         values ($1, $2)
         on conflict (puuid) do update set riot_game_name = excluded.riot_game_name
         returning id`,
        [line.puuid, line.puuid],
      )

      await db.query(
        `insert into public.match_players
           (match_id, side, participant_index, puuid, player_id, team_id, riot_game_name,
            champion, position, win, kills, deaths, assists, cs, gold_earned,
            damage_to_champions, damage_mitigated, vision_score, wards_killed,
            largest_killing_spree, penta_kills, raw)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
                 $16, $17, $18, $19, $20, $21, '{}'::jsonb)`,
        [
          matchId,
          side,
          side + index,
          line.puuid,
          player.rows[0].id,
          teamId,
          line.puuid,
          line.champion ?? 'Ahri',
          line.position ?? POSITIONS[index % POSITIONS.length],
          side === winningSide,
          line.kills ?? 0,
          line.deaths ?? 0,
          line.assists ?? 0,
          line.cs ?? 0,
          line.gold ?? 10_000,
          line.damage ?? 10_000,
          line.mitigated ?? 0,
          line.vision ?? 0,
          line.wardsKilled ?? 0,
          line.spree ?? 0,
          line.pentas ?? 0,
        ],
      )
    }
  }

  return matchId
}
