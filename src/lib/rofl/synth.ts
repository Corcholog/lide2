import type { RoflPlayerStats } from './types'

/**
 * Builder of synthetic .rofl files.
 *
 * Used by the tests and by scripts/make-fixture.ts to generate small,
 * anonymized fixtures out of a real replay (real .rofl files weigh 10-30 MB and
 * carry real PUUIDs, so they are not committed).
 */
const ROFL_SIGNATURE = [0x52, 0x49, 0x4f, 0x54, 0x00, 0x00]
export const ROFL2_SIGNATURE = [0x52, 0x49, 0x4f, 0x54, 0x02, 0x00]

export interface BuildOptions {
  gameLength?: number
  gameVersion?: string
  lastGameChunkId?: number
  lastKeyFrameId?: number
  /** Filler bytes standing in for the real replay's encrypted payload. */
  payloadSize?: number
  /** Lets a test force an arbitrary statsJson (empty, corrupt, and so on). */
  statsJson?: string
}

export function player(overrides: Partial<RoflPlayerStats> = {}): RoflPlayerStats {
  return {
    PUUID: 'puuid-0000',
    NAME: 'Jugador',
    RIOT_ID_GAME_NAME: 'Jugador',
    RIOT_ID_TAG_LINE: 'LAS',
    SKIN: 'Ahri',
    TEAM: '100',
    WIN: 'Win',
    TEAM_POSITION: 'MIDDLE',
    CHAMPIONS_KILLED: '5',
    NUM_DEATHS: '2',
    ASSISTS: '7',
    GOLD_EARNED: '12000',
    MINIONS_KILLED: '180',
    NEUTRAL_MINIONS_KILLED: '12',
    TOTAL_DAMAGE_DEALT_TO_CHAMPIONS: '24000',
    VISION_SCORE: '30',
    LEVEL: '16',
    ...overrides,
  }
}

/** 10 players, 5 a side; side 100 wins. */
export function defaultRoster(): RoflPlayerStats[] {
  const champions = ['Ahri', 'Lee Sin', 'Jinx', 'Thresh', 'Ornn']
  return [100, 200].flatMap((team) =>
    champions.map((champion, i) =>
      player({
        PUUID: `puuid-${team}-${i}`,
        NAME: `Player${team}${i}`,
        RIOT_ID_GAME_NAME: `Player${team}${i}`,
        SKIN: champion,
        TEAM: String(team),
        WIN: team === 100 ? 'Win' : 'Fail',
        CHAMPIONS_KILLED: String(3 + i),
        NUM_DEATHS: String(1 + i),
        ASSISTS: String(2 + i),
      }),
    ),
  )
}

function buildMetadata(players: RoflPlayerStats[], options: BuildOptions): Buffer {
  const metadata = {
    ...(options.gameVersion ? { gameVersion: options.gameVersion } : {}),
    gameLength: options.gameLength ?? 1_800_000,
    lastGameChunkId: options.lastGameChunkId ?? 120,
    lastKeyFrameId: options.lastKeyFrameId ?? 60,
    statsJson: options.statsJson ?? JSON.stringify(players),
  }
  return Buffer.from(JSON.stringify(metadata), 'utf8')
}

/** Builds a synthetic .rofl in the new format (metadata at the end of the file). */
export function buildRofl2(players: RoflPlayerStats[], options: BuildOptions = {}): Buffer {
  const header = Buffer.alloc(288)
  Buffer.from(ROFL2_SIGNATURE).copy(header, 0)
  Buffer.from(options.gameVersion ?? '15.16.700.4321', 'utf8').copy(header, 15)

  const payload = Buffer.alloc(options.payloadSize ?? 4096, 0x41)
  const metadata = buildMetadata(players, options)
  const footer = Buffer.alloc(4)
  footer.writeUInt32LE(metadata.length, 0)

  return Buffer.concat([header, payload, metadata, footer])
}

/** Builds a synthetic .rofl in the old format (metadata inside the header). */
export function buildRofl1(players: RoflPlayerStats[], options: BuildOptions = {}): Buffer {
  const header = Buffer.alloc(288)
  Buffer.from(ROFL_SIGNATURE).copy(header, 0)

  const metadata = buildMetadata(players, {
    ...options,
    gameVersion: options.gameVersion ?? '14.9.500.1234',
  })
  const payload = Buffer.alloc(options.payloadSize ?? 4096, 0x41)
  const fileLength = 288 + metadata.length + payload.length

  const lengths = Buffer.alloc(26)
  lengths.writeUInt16LE(288, 0) // header length
  lengths.writeUInt32LE(fileLength, 2) // file length
  lengths.writeUInt32LE(288, 6) // metadata offset
  lengths.writeUInt32LE(metadata.length, 10) // metadata length
  lengths.writeUInt32LE(288 + metadata.length, 14) // payload header offset
  lengths.writeUInt32LE(0, 18) // payload header length
  lengths.writeUInt32LE(288 + metadata.length, 22) // payload offset
  lengths.copy(header, 262)

  return Buffer.concat([header, metadata, payload])
}
