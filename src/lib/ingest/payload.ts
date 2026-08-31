import type { NormalizedMatch, NormalizedPlayer } from '../rofl'

/**
 * Construccion del payload de `ingest_match(jsonb)`.
 *
 * Las claves son literalmente los nombres de columna de `matches` y
 * `match_players`: la funcion de Postgres arma las filas con
 * jsonb_populate_record, asi que el contrato entre TS y SQL es el nombre del
 * campo. Cualquier clave que no exista como columna se ignora en silencio, por
 * eso hay un test contra el esquema real (tests/db.test.ts).
 */

export interface IngestFile {
  storage_path: string
  file_name: string
  file_size: number
  sha256?: string | null
  storage_provider?: string
  /** PUUID del jugador cuyo cliente grabo el replay, si se conoce. */
  client_puuid?: string | null
  uploaded_by?: string | null
}

export interface IngestOptions {
  /**
   * El .rofl que la originó, si está guardado en algún lado.
   *
   * Opcional porque `ingest_match` siempre lo trató así (`if v_file is not
   * null`): se puede guardar una partida sin su archivo. Lo usa el backfill
   * local, que parsea desde el disco para no subir cientos de MB al bucket por
   * datos de prueba. Sin archivo no hay fila en `match_files`, o sea que la
   * partida no se puede descargar ni deduplicar por sha256 —para eso queda el
   * `fingerprint`, que es la identidad de verdad—.
   */
  file?: IngestFile
  tournamentId?: string | null
  /** Formato suizo: etapa ("Suizo", "Playoffs") y ronda ("Ronda 3"). */
  stageLabel?: string | null
  roundLabel?: string | null
  createdBy?: string | null
}

export type IngestPayload = Record<string, unknown>

function playerRow(player: NormalizedPlayer): Record<string, unknown> {
  return {
    side: player.side,
    participant_index: player.participantIndex,
    puuid: player.puuid,
    riot_game_name: player.riotGameName,
    riot_tag_line: player.riotTagLine,
    summoner_name: player.summonerName,
    champion: player.champion,
    position: player.position,
    win: player.win,

    kills: player.kills,
    deaths: player.deaths,
    assists: player.assists,
    champion_level: player.championLevel,
    exp: player.exp,

    gold_earned: player.goldEarned,
    gold_spent: player.goldSpent,
    minions_killed: player.minionsKilled,
    neutral_minions_killed: player.neutralMinionsKilled,
    cs: player.minionsKilled + player.neutralMinionsKilled,

    damage_to_champions: player.damageToChampions,
    physical_damage_to_champions: player.physicalDamageToChampions,
    magic_damage_to_champions: player.magicDamageToChampions,
    true_damage_to_champions: player.trueDamageToChampions,
    damage_taken: player.damageTaken,
    damage_taken_from_champions: player.damageTakenFromChampions,
    damage_mitigated: player.damageMitigated,
    damage_to_turrets: player.damageToTurrets,
    damage_to_objectives: player.damageToObjectives,
    total_heal: player.totalHeal,
    heal_on_teammates: player.healOnTeammates,
    shielded_on_teammates: player.shieldedOnTeammates,

    vision_score: player.visionScore,
    wards_placed: player.wardsPlaced,
    wards_killed: player.wardsKilled,
    detector_wards_placed: player.detectorWardsPlaced,
    control_wards_bought: player.controlWardsBought,

    turret_takedowns: player.turretTakedowns,
    inhibitor_takedowns: player.inhibitorTakedowns,
    dragon_kills: player.dragonKills,
    baron_kills: player.baronKills,
    herald_kills: player.heraldKills,
    atakhan_kills: player.atakhanKills,
    void_grub_kills: player.voidGrubKills,
    objectives_stolen: player.objectivesStolen,

    largest_killing_spree: player.largestKillingSpree,
    largest_multi_kill: player.largestMultiKill,
    double_kills: player.doubleKills,
    triple_kills: player.tripleKills,
    quadra_kills: player.quadraKills,
    penta_kills: player.pentaKills,

    time_ccing_others: player.timeCcingOthers,
    total_time_spent_dead: player.totalTimeSpentDead,
    longest_time_living: player.longestTimeLiving,
    time_played: player.timePlayed,

    items: player.items,
    summoner_spell_1: player.summonerSpell1,
    summoner_spell_2: player.summonerSpell2,
    keystone_id: player.keystoneId,
    perk_primary_style: player.perkPrimaryStyle,
    perk_sub_style: player.perkSubStyle,

    was_afk: player.wasAfk,
    was_leaver: player.wasLeaver,
    avg_ping: player.avgPing,

    raw: player.raw,
  }
}

export function buildIngestPayload(match: NormalizedMatch, options: IngestOptions): IngestPayload {
  return {
    tournament_id: options.tournamentId ?? null,
    stage_label: options.stageLabel ?? null,
    round_label: options.roundLabel ?? null,

    fingerprint: match.fingerprint,
    riot_match_id: match.riotMatchId,
    format: match.format,
    game_version: match.gameVersion,
    patch: match.patch,
    game_length_ms: match.gameLengthMs,
    played_at: match.playedAt,
    winning_side: match.winningSide,
    ended_in_surrender: match.endedInSurrender,
    ended_in_early_surrender: match.endedInEarlySurrender,
    raw_metadata: match.rawMetadata,
    created_by: options.createdBy ?? null,

    /*
      Sin archivo la clave NO va, en vez de ir en null: `ingest_match` hace
      `payload->'file'` y pregunta `is not null`, y un null de JSON pasa esa
      prueba —es un jsonb 'null', no un NULL de SQL— con lo que termina
      intentando insertar una fila de `match_files` con storage_path vacío.
    */
    ...(options.file
      ? {
          file: {
            storage_provider: 'supabase',
            sha256: null,
            client_puuid: null,
            uploaded_by: options.createdBy ?? null,
            ...options.file,
          },
        }
      : {}),

    players: match.players.map(playerRow),
  }
}

/** Nombres de columna que el payload escribe, para chequear contra el esquema. */
export const MATCH_COLUMNS = [
  'tournament_id',
  'stage_label',
  'round_label',
  'fingerprint',
  'riot_match_id',
  'format',
  'game_version',
  'patch',
  'game_length_ms',
  'played_at',
  'winning_side',
  'ended_in_surrender',
  'ended_in_early_surrender',
  'raw_metadata',
  'created_by',
] as const
