/**
 * Types for the .rofl parser (League of Legends replays).
 *
 * Format references:
 *  - https://github.com/fraxiinus/roflxd.cs  (Rofl2Reader / RoflReader) - offsets and signatures
 *  - https://github.com/gzordrai/rofl-parser.js (MIT) - the original logic, ported here
 */

/** ROFL = old format (< 14.9). ROFL2 = new format (>= 14.11). */
export type RoflFormat = 'ROFL' | 'ROFL2'

export type RoflErrorCode =
  /** Does not start with the "RIOT" signature, or the file is not a replay. */
  | 'NOT_A_ROFL'
  /** The file is smaller than the header, or the offsets fall outside it. */
  | 'TRUNCATED_FILE'
  /** Patch between 13.20 and 14.10: Riot stored no stats in those replays. */
  | 'METADATA_EMPTY'
  /** The metadata exists but is not valid JSON. */
  | 'MALFORMED_METADATA'
  /** The JSON parsed but does not have the expected shape (10 players with PUUID and champion). */
  | 'UNSUPPORTED_STATS'
  /** The file could not be read from storage. */
  | 'STORAGE_UNAVAILABLE'

export class RoflParseError extends Error {
  readonly code: RoflErrorCode
  readonly details?: unknown

  constructor(code: RoflErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'RoflParseError'
    this.code = code
    this.details = details
  }
}

/**
 * One player exactly as `statsJson` gives them: ~180 keys in SCREAMING_CASE and
 * **every value as a string** (numbers included, some in scientific notation:
 * "1.234E+07").
 */
export type RoflPlayerStats = Record<string, string>

/** Raw replay metadata, with `statsJson` already parsed. */
export interface RoflMetadata {
  format: RoflFormat
  /** E.g. "15.16.700.4321". Null in old files that do not declare it. */
  gameVersion: string | null
  /** Duration in milliseconds. */
  gameLengthMs: number
  lastGameChunkId: number
  lastKeyFrameId: number
  players: RoflPlayerStats[]
}
