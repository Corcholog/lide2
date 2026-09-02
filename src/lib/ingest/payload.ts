import type { NormalizedMatch, NormalizedPlayer } from '../rofl'

/**
 * Building the payload for `ingest_match(jsonb)`.
 *
 * The keys are literally the column names of `matches` and `match_players`: the
 * Postgres function builds the rows with jsonb_populate_record, so the contract
 * between TS and SQL is the field name. Any key that does not exist as a column
 * is silently ignored, which is why there is a test against the real schema
 * (tests/db.test.ts).
 */

export interface IngestFile {
  storage_path: string
  file_name: string
  file_size: number
  sha256?: string | null
  storage_provider?: string
  /** PUUID of the player whose client recorded the replay, when it is known. */
  client_puuid?: string | null
  uploaded_by?: string | null
}

export interface IngestOptions {
  /**
   * The .rofl the match came from, if it is stored anywhere.
   *
   * Optional because `ingest_match` always treated it that way (`if v_file is
   * not null`): a match can be saved without its file. The local backfill uses
   * that, parsing from disk so hundreds of MB of test data never reach the
   * bucket. With no file there is no `match_files` row, which means the match
   * can neither be downloaded nor deduplicated by sha256 - the `fingerprint` is
   * left for that, and it is the real identity anyway.
   */
  file?: IngestFile
  tournamentId?: string | null
  /** Swiss format: stage ("Suizo", "Playoffs") and round ("Ronda 3"). */
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
      With no file the key is left OUT rather than set to null: `ingest_match`
      does `payload->'file'` and asks `is not null`, and a JSON null passes that
      test - it is a jsonb 'null', not a SQL NULL - so it ends up trying to
      insert a `match_files` row with an empty storage_path.
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
