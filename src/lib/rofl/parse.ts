import { RoflParseError, type RoflFormat, type RoflMetadata, type RoflPlayerStats } from './types'
import { bufferSource, type RoflSource } from './source'

/**
 * Header de tamaño fijo en ambos formatos: 6 bytes de firma + 256 de firma
 * criptográfica + 26 de la tabla de longitudes (que sólo usa el formato viejo).
 */
export const ROFL_HEADER_BYTES = 288

/** "RIOT" + 0x00 0x00 — formato viejo, metadata en el header. */
const SIGNATURE_ROFL = Buffer.from([0x52, 0x49, 0x4f, 0x54, 0x00, 0x00])
/** "RIOT" + 0x02 0x00 — formato nuevo (>= 14.11), metadata al final del archivo. */
const SIGNATURE_ROFL2 = Buffer.from([0x52, 0x49, 0x4f, 0x54, 0x02, 0x00])

const GAME_VERSION_OFFSET = 15
const GAME_VERSION_LENGTH = 14
const LENGTHS_OFFSET = 262
/** Los últimos 4 bytes del archivo: uint32 LE con el largo de la metadata. */
const FOOTER_BYTES = 4
const MAX_METADATA_BYTES = 8 * 1024 * 1024

const EMPTY_STATS_MESSAGE =
  'El replay no tiene estadísticas. Riot las quitó de los .rofl entre los parches ' +
  '13.20 y 14.10; los replays grabados en ese rango no tienen datos recuperables.'

/**
 * Recorta el padding de un campo de texto leido del binario: son de largo fijo
 * y vienen rellenados con NUL (0x00). charCodeAt <= 32 cubre NUL, espacios,
 * tabs y saltos de linea, sin necesidad de escapes de control en el fuente.
 */
function trimPadding(value: string): string {
  let last = value.length
  while (last > 0 && value.charCodeAt(last - 1) <= 32) last--
  let first = 0
  while (first < last && value.charCodeAt(first) <= 32) first++
  return value.slice(first, last)
}

interface RoflLengths {
  header: number
  file: number
  metadataOffset: number
  metadata: number
  payloadHeaderOffset: number
  payloadHeader: number
  payloadOffset: number
}

interface RawRoflMetadata {
  gameLength?: number | string
  gameVersion?: string
  lastGameChunkId?: number | string
  lastKeyFrameId?: number | string
  statsJson?: string
}

export function detectFormat(header: Buffer): RoflFormat {
  if (header.length >= 6) {
    if (header.subarray(0, 6).equals(SIGNATURE_ROFL2)) return 'ROFL2'
    if (header.subarray(0, 6).equals(SIGNATURE_ROFL)) return 'ROFL'
  }

  const magic = header.subarray(0, 4).toString('latin1')
  throw new RoflParseError(
    'NOT_A_ROFL',
    magic === 'RIOT'
      ? 'Es un archivo de Riot pero con una firma desconocida; puede ser un formato nuevo todavía no soportado.'
      : 'El archivo no es un .rofl válido (no empieza con la firma "RIOT").',
    { signature: header.subarray(0, 6).toString('hex') },
  )
}

/** Versión del build del juego, ej. "15.16.700.4321". Sólo presente en ROFL2. */
export function readGameVersion(header: Buffer): string | null {
  const raw = trimPadding(
    header.subarray(GAME_VERSION_OFFSET, GAME_VERSION_OFFSET + GAME_VERSION_LENGTH).toString('utf8'),
  )

  return /^\d+\.\d+/.test(raw) ? raw : null
}

/** Tabla de offsets del formato viejo, 26 bytes a partir del byte 262. */
export function readLengths(header: Buffer): RoflLengths {
  const b = header.subarray(LENGTHS_OFFSET, LENGTHS_OFFSET + 26)
  return {
    header: b.readUInt16LE(0),
    file: b.readUInt32LE(2),
    metadataOffset: b.readUInt32LE(6),
    metadata: b.readUInt32LE(10),
    payloadHeaderOffset: b.readUInt32LE(14),
    payloadHeader: b.readUInt32LE(18),
    payloadOffset: b.readUInt32LE(22),
  }
}

export async function parseRofl(source: RoflSource): Promise<RoflMetadata> {
  if (source.size < ROFL_HEADER_BYTES + FOOTER_BYTES) {
    throw new RoflParseError(
      'TRUNCATED_FILE',
      `El archivo tiene ${source.size} bytes: es demasiado chico para ser un replay.`,
    )
  }

  const header = await source.read(0, ROFL_HEADER_BYTES)
  const format = detectFormat(header)

  const { metadataBuffer, gameVersion } =
    format === 'ROFL2'
      ? await readRofl2Metadata(source, header)
      : await readLegacyMetadata(source, header)

  return decodeMetadata(metadataBuffer, format, gameVersion)
}

/** Atajo para tests y para el CLI cuando ya se tiene el archivo en memoria. */
export function parseRoflBuffer(buf: Buffer): Promise<RoflMetadata> {
  return parseRofl(bufferSource(buf))
}

async function readRofl2Metadata(source: RoflSource, header: Buffer) {
  const gameVersion = readGameVersion(header)
  const footer = await source.read(source.size - FOOTER_BYTES, FOOTER_BYTES)
  const metadataLength = footer.readUInt32LE(0)
  const metadataStart = source.size - FOOTER_BYTES - metadataLength

  if (metadataLength === 0) {
    throw new RoflParseError('METADATA_EMPTY', EMPTY_STATS_MESSAGE, { gameVersion })
  }

  if (metadataLength > MAX_METADATA_BYTES || metadataStart < ROFL_HEADER_BYTES) {
    throw new RoflParseError(
      'TRUNCATED_FILE',
      'El bloque de metadata declara un tamaño imposible; el archivo está corrupto o incompleto.',
      { metadataLength, fileSize: source.size },
    )
  }

  return { metadataBuffer: await source.read(metadataStart, metadataLength), gameVersion }
}

async function readLegacyMetadata(source: RoflSource, header: Buffer) {
  const lengths = readLengths(header)

  if (lengths.metadata === 0) {
    throw new RoflParseError('METADATA_EMPTY', EMPTY_STATS_MESSAGE, { lengths })
  }

  if (
    lengths.metadata > MAX_METADATA_BYTES ||
    lengths.metadataOffset + lengths.metadata > source.size
  ) {
    throw new RoflParseError(
      'TRUNCATED_FILE',
      'La tabla de offsets apunta fuera del archivo; está corrupto o incompleto.',
      { lengths, fileSize: source.size },
    )
  }

  return {
    metadataBuffer: await source.read(lengths.metadataOffset, lengths.metadata),
    gameVersion: null,
  }
}

function decodeMetadata(
  metadataBuffer: Buffer,
  format: RoflFormat,
  headerGameVersion: string | null,
): RoflMetadata {
  const text = trimPadding(metadataBuffer.toString('utf8'))

  let raw: RawRoflMetadata
  try {
    raw = JSON.parse(text) as RawRoflMetadata
  } catch (cause) {
    throw new RoflParseError('MALFORMED_METADATA', 'La metadata del replay no es JSON válido.', {
      preview: text.slice(0, 200),
      cause,
    })
  }

  if (!raw.statsJson || raw.statsJson === '[]') {
    throw new RoflParseError('METADATA_EMPTY', EMPTY_STATS_MESSAGE, {
      gameVersion: raw.gameVersion ?? headerGameVersion,
    })
  }

  let players: RoflPlayerStats[]
  try {
    players = JSON.parse(raw.statsJson) as RoflPlayerStats[]
  } catch (cause) {
    throw new RoflParseError('MALFORMED_METADATA', 'El campo statsJson no es JSON válido.', {
      cause,
    })
  }

  if (!Array.isArray(players) || players.length === 0) {
    throw new RoflParseError('METADATA_EMPTY', EMPTY_STATS_MESSAGE)
  }

  const incomplete = players.find((p) => !p?.PUUID || !p?.SKIN)
  if (incomplete) {
    throw new RoflParseError(
      'UNSUPPORTED_STATS',
      'Las estadísticas del replay no tienen el formato esperado (falta PUUID o campeón).',
      { keys: Object.keys(incomplete).slice(0, 20) },
    )
  }

  return {
    format,
    gameVersion: headerGameVersion ?? raw.gameVersion ?? null,
    gameLengthMs: Number(raw.gameLength ?? 0),
    lastGameChunkId: Number(raw.lastGameChunkId ?? 0),
    lastKeyFrameId: Number(raw.lastKeyFrameId ?? 0),
    players,
  }
}
