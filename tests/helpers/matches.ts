import type { PGlite } from '@electric-sql/pglite'

/**
 * Builds a match by hand: the `matches` row and one player a side.
 *
 * One player a side is enough because the views sum by side, and it saves the
 * 10 rows of a real scoreboard in tests that do not look at individual stats.
 * For real ingest there are the .rofl fixtures.
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
 * One scoreboard line: a player with their numbers.
 *
 * Everything has a default because each test looks at two or three columns, and
 * filling in ten fields per player to exercise the vision ranking is pure
 * noise.
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

const POSITIONS = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'SUPPORT']

/**
 * Builds a match with the whole scoreboard, the way the ingest leaves it.
 *
 * Unlike playMatch (one player a side, which is enough for the views that sum
 * by side), this is needed for everything that looks at the player: MVP, kill
 * participation, individual rankings and per-university attribution.
 *
 * It also creates the `players` row and links it, which is what ingest_match()
 * does: without that, player_id stays null and a person's university cannot be
 * resolved.
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
