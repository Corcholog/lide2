import { createHash } from 'node:crypto'

interface FingerprintPlayer {
  puuid: string
  champion: string
  kills: number
  deaths: number
  assists: number
}

/**
 * A match's stable identity, independent of the file.
 *
 * Every client records its own .rofl, so team A's file and team B's file for
 * the same match are different bytes: they cannot be deduplicated by file hash.
 * This does join them, while still telling apart two games of the same Bo3
 * between the same 10 players (champions and KDA change).
 */
export function matchFingerprint(players: FingerprintPlayer[], gameLengthMs: number): string {
  const rows = players
    .map((p) => `${p.puuid}:${p.champion}:${p.kills}/${p.deaths}/${p.assists}`)
    .sort()

  rows.push(`len:${Math.round(gameLengthMs / 1000)}`)

  return createHash('sha256').update(rows.join('|')).digest('hex')
}

/**
 * The .rofl does not store the match id, but the client names the file after
 * it: "LA2-1234567890.rofl". Expects a file name, not a path. Returns null when
 * the name does not follow that pattern.
 */
export function riotMatchIdFromFileName(fileName: string): string | null {
  const m = /^([A-Za-z]{2,5}\d?)-(\d+)/.exec(fileName)
  return m ? `${m[1].toUpperCase()}-${m[2]}` : null
}

export function sha256(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex')
}
