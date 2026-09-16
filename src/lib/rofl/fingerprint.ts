import { createHash } from 'node:crypto'

interface FingerprintPlayer {
  puuid: string
  champion: string
  kills: number
  deaths: number
  assists: number
}

/**
 * A match's identity, independent of the file.
 *
 * Each client records its own .rofl, so the two teams' files for one match
 * differ byte for byte. The fingerprint matches them while still telling apart
 * two games of a series between the same ten players.
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
