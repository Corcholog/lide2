/**
 * Tipos del parser de archivos .rofl (replays de League of Legends).
 *
 * Referencias del formato:
 *  - https://github.com/fraxiinus/roflxd.cs  (Rofl2Reader / RoflReader) — offsets y firmas
 *  - https://github.com/gzordrai/rofl-parser.js (MIT) — lógica original portada acá
 */

/** ROFL = formato viejo (< 14.9). ROFL2 = formato nuevo (>= 14.11). */
export type RoflFormat = 'ROFL' | 'ROFL2'

export type RoflErrorCode =
  /** No empieza con la firma "RIOT" o el archivo no es un replay. */
  | 'NOT_A_ROFL'
  /** El archivo es más chico que el header, o los offsets caen fuera del archivo. */
  | 'TRUNCATED_FILE'
  /** Parche entre 13.20 y 14.10: Riot no guardó stats en esos replays. */
  | 'METADATA_EMPTY'
  /** La metadata existe pero no es JSON válido. */
  | 'MALFORMED_METADATA'
  /** El JSON parseó pero no tiene la forma esperada (10 jugadores con PUUID y campeón). */
  | 'UNSUPPORTED_STATS'
  /** No se pudo leer el archivo desde el storage. */
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
 * Un jugador tal cual viene en `statsJson`: ~180 claves en SCREAMING_CASE y
 * **todos los valores como string** (incluso los números, algunos en notación
 * científica: "1.234E+07").
 */
export type RoflPlayerStats = Record<string, string>

/** Metadata cruda del replay, ya con `statsJson` parseado. */
export interface RoflMetadata {
  format: RoflFormat
  /** Ej. "15.16.700.4321". Null en archivos viejos que no lo declaran. */
  gameVersion: string | null
  /** Duración en milisegundos. */
  gameLengthMs: number
  lastGameChunkId: number
  lastKeyFrameId: number
  players: RoflPlayerStats[]
}
