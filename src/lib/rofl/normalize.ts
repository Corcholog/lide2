import { matchFingerprint, riotMatchIdFromFileName } from './fingerprint'
import type { RoflMetadata, RoflPlayerStats } from './types'

/**
 * Todos los valores de statsJson son strings; algunos números vienen en
 * notación científica ("1.234E+07"). Number() los resuelve bien, pero hay que
 * cubrir vacíos y basura.
 */
export function toInt(value: unknown): number {
  const n = Number(String(value ?? '').trim())
  return Number.isFinite(n) ? Math.round(n) : 0
}

export function toFloat(value: unknown): number {
  const n = Number(String(value ?? '').trim())
  return Number.isFinite(n) ? n : 0
}

export function toBool(value: unknown): boolean {
  const v = String(value ?? '').trim().toLowerCase()
  return v === '1' || v === 'true'
}

export type TeamSide = 100 | 200

export interface NormalizedPlayer {
  side: TeamSide
  participantIndex: number
  puuid: string
  riotGameName: string | null
  riotTagLine: string | null
  summonerName: string | null
  champion: string
  position: string | null
  win: boolean

  kills: number
  deaths: number
  assists: number
  championLevel: number
  exp: number

  goldEarned: number
  goldSpent: number
  minionsKilled: number
  neutralMinionsKilled: number

  damageToChampions: number
  physicalDamageToChampions: number
  magicDamageToChampions: number
  trueDamageToChampions: number
  damageTaken: number
  damageTakenFromChampions: number
  damageMitigated: number
  damageToTurrets: number
  damageToObjectives: number
  totalHeal: number
  healOnTeammates: number
  shieldedOnTeammates: number

  visionScore: number
  wardsPlaced: number
  wardsKilled: number
  detectorWardsPlaced: number
  controlWardsBought: number

  turretTakedowns: number
  inhibitorTakedowns: number
  dragonKills: number
  baronKills: number
  heraldKills: number
  atakhanKills: number
  voidGrubKills: number
  objectivesStolen: number

  largestKillingSpree: number
  largestMultiKill: number
  doubleKills: number
  tripleKills: number
  quadraKills: number
  pentaKills: number

  timeCcingOthers: number
  totalTimeSpentDead: number
  longestTimeLiving: number
  timePlayed: number

  items: number[]
  summonerSpell1: string | null
  summonerSpell2: string | null
  keystoneId: number
  perkPrimaryStyle: number
  perkSubStyle: number

  wasAfk: boolean
  wasLeaver: boolean
  avgPing: number

  /** Los ~180 campos originales, sin tocar. */
  raw: RoflPlayerStats
}

export interface NormalizedMatch {
  format: RoflMetadata['format']
  gameVersion: string | null
  /** Parche corto derivado de gameVersion, ej. "15.16". */
  patch: string | null
  gameLengthMs: number
  winningSide: TeamSide | null
  endedInSurrender: boolean
  endedInEarlySurrender: boolean
  riotMatchId: string | null
  playedAt: string | null
  fingerprint: string
  rawMetadata: Record<string, unknown>
  players: NormalizedPlayer[]
}

export interface NormalizeOptions {
  /** Nombre original del archivo, del que sale el match id ("LA2-1234567890.rofl"). */
  fileName?: string
  /** El .rofl no guarda la fecha; se usa el lastModified del archivo como estimación. */
  playedAt?: Date | string | null
}

function text(value: unknown): string | null {
  const v = String(value ?? '').trim()
  return v.length > 0 ? v : null
}

function normalizePlayer(raw: RoflPlayerStats, index: number): NormalizedPlayer {
  const side: TeamSide = toInt(raw.TEAM) === 200 ? 200 : 100

  return {
    side,
    participantIndex: index,
    puuid: String(raw.PUUID),
    riotGameName: text(raw.RIOT_ID_GAME_NAME),
    riotTagLine: text(raw.RIOT_ID_TAG_LINE),
    summonerName: text(raw.NAME),
    champion: String(raw.SKIN),
    position: text(raw.TEAM_POSITION) ?? text(raw.INDIVIDUAL_POSITION),
    win: String(raw.WIN ?? '').trim().toLowerCase() === 'win',

    kills: toInt(raw.CHAMPIONS_KILLED),
    deaths: toInt(raw.NUM_DEATHS),
    assists: toInt(raw.ASSISTS),
    championLevel: toInt(raw.LEVEL),
    exp: toInt(raw.EXP),

    goldEarned: toInt(raw.GOLD_EARNED),
    goldSpent: toInt(raw.GOLD_SPENT),
    minionsKilled: toInt(raw.MINIONS_KILLED),
    neutralMinionsKilled: toInt(raw.NEUTRAL_MINIONS_KILLED),

    damageToChampions: toInt(raw.TOTAL_DAMAGE_DEALT_TO_CHAMPIONS),
    physicalDamageToChampions: toInt(raw.PHYSICAL_DAMAGE_DEALT_TO_CHAMPIONS),
    magicDamageToChampions: toInt(raw.MAGIC_DAMAGE_DEALT_TO_CHAMPIONS),
    trueDamageToChampions: toInt(raw.TRUE_DAMAGE_DEALT_TO_CHAMPIONS),
    damageTaken: toInt(raw.TOTAL_DAMAGE_TAKEN),
    damageTakenFromChampions: toInt(raw.TOTAL_DAMAGE_TAKEN_FROM_CHAMPIONS),
    damageMitigated: toInt(raw.TOTAL_DAMAGE_SELF_MITIGATED),
    damageToTurrets: toInt(raw.TOTAL_DAMAGE_DEALT_TO_TURRETS),
    damageToObjectives: toInt(raw.TOTAL_DAMAGE_DEALT_TO_OBJECTIVES),
    totalHeal: toInt(raw.TOTAL_HEAL),
    healOnTeammates: toInt(raw.TOTAL_HEAL_ON_TEAMMATES),
    shieldedOnTeammates: toInt(raw.TOTAL_DAMAGE_SHIELDED_ON_TEAMMATES),

    visionScore: toInt(raw.VISION_SCORE),
    wardsPlaced: toInt(raw.WARD_PLACED),
    wardsKilled: toInt(raw.WARD_KILLED),
    detectorWardsPlaced: toInt(raw.WARD_PLACED_DETECTOR),
    controlWardsBought: toInt(raw.VISION_WARDS_BOUGHT_IN_GAME),

    turretTakedowns: toInt(raw.TURRET_TAKEDOWNS),
    inhibitorTakedowns: toInt(raw.BARRACKS_TAKEDOWNS),
    dragonKills: toInt(raw.DRAGON_KILLS),
    baronKills: toInt(raw.BARON_KILLS),
    heraldKills: toInt(raw.RIFT_HERALD_KILLS),
    atakhanKills: toInt(raw.ATAKHAN_KILLS),
    voidGrubKills: toInt(raw.HORDE_KILLS),
    objectivesStolen: toInt(raw.OBJECTIVES_STOLEN),

    largestKillingSpree: toInt(raw.LARGEST_KILLING_SPREE),
    largestMultiKill: toInt(raw.LARGEST_MULTI_KILL),
    doubleKills: toInt(raw.DOUBLE_KILLS),
    tripleKills: toInt(raw.TRIPLE_KILLS),
    quadraKills: toInt(raw.QUADRA_KILLS),
    pentaKills: toInt(raw.PENTA_KILLS),

    timeCcingOthers: toInt(raw.TIME_CCING_OTHERS),
    totalTimeSpentDead: toInt(raw.TOTAL_TIME_SPENT_DEAD),
    longestTimeLiving: toInt(raw.LONGEST_TIME_SPENT_LIVING),
    timePlayed: toInt(raw.TIME_PLAYED),

    items: [
      toInt(raw.ITEM0),
      toInt(raw.ITEM1),
      toInt(raw.ITEM2),
      toInt(raw.ITEM3),
      toInt(raw.ITEM4),
      toInt(raw.ITEM5),
      toInt(raw.ITEM6),
    ],
    summonerSpell1: text(raw.SUMMONER_SPELL_1),
    summonerSpell2: text(raw.SUMMONER_SPELL_2),
    keystoneId: toInt(raw.KEYSTONE_ID),
    perkPrimaryStyle: toInt(raw.PERK_PRIMARY_STYLE),
    perkSubStyle: toInt(raw.PERK_SUB_STYLE),

    wasAfk: toBool(raw.WAS_AFK),
    wasLeaver: toBool(raw.WAS_LEAVER),
    avgPing: toInt(raw.PING),

    raw,
  }
}

/** "15.16.700.4321" -> "15.16" */
export function shortPatch(gameVersion: string | null): string | null {
  if (!gameVersion) return null
  const m = /^(\d+)\.(\d+)/.exec(gameVersion)
  return m ? `${m[1]}.${m[2]}` : null
}

export function normalizeMatch(
  metadata: RoflMetadata,
  options: NormalizeOptions = {},
): NormalizedMatch {
  const players = metadata.players.map(normalizePlayer)
  const winner = players.find((p) => p.win)
  const playedAt = options.playedAt ? new Date(options.playedAt) : null

  return {
    format: metadata.format,
    gameVersion: metadata.gameVersion,
    patch: shortPatch(metadata.gameVersion),
    gameLengthMs: metadata.gameLengthMs,
    winningSide: winner?.side ?? null,
    endedInSurrender: players.some((p) => toBool(p.raw.GAME_ENDED_IN_SURRENDER)),
    endedInEarlySurrender: players.some((p) => toBool(p.raw.GAME_ENDED_IN_EARLY_SURRENDER)),
    riotMatchId: options.fileName ? riotMatchIdFromFileName(options.fileName) : null,
    playedAt: playedAt && !Number.isNaN(playedAt.getTime()) ? playedAt.toISOString() : null,
    fingerprint: matchFingerprint(players, metadata.gameLengthMs),
    rawMetadata: {
      format: metadata.format,
      gameVersion: metadata.gameVersion,
      gameLength: metadata.gameLengthMs,
      lastGameChunkId: metadata.lastGameChunkId,
      lastKeyFrameId: metadata.lastKeyFrameId,
    },
    players,
  }
}
