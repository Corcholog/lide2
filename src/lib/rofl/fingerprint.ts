import { createHash } from 'node:crypto'

interface FingerprintPlayer {
  puuid: string
  champion: string
  kills: number
  deaths: number
  assists: number
}

/**
 * Identidad estable de una partida, independiente del archivo.
 *
 * Cada cliente graba su propio .rofl, así que el archivo del equipo A y el del
 * equipo B de la misma partida son bytes distintos: no se puede deduplicar por
 * hash del archivo. Esto sí los une, y a la vez distingue dos partidas del
 * mismo Bo3 entre los mismos 10 jugadores (cambian campeones y KDA).
 */
export function matchFingerprint(players: FingerprintPlayer[], gameLengthMs: number): string {
  const rows = players
    .map((p) => `${p.puuid}:${p.champion}:${p.kills}/${p.deaths}/${p.assists}`)
    .sort()

  rows.push(`len:${Math.round(gameLengthMs / 1000)}`)

  return createHash('sha256').update(rows.join('|')).digest('hex')
}

/**
 * El .rofl no guarda el match id, pero el cliente nombra el archivo con él:
 * "LA2-1234567890.rofl". Espera un nombre de archivo, no una ruta.
 * Devuelve null si el nombre no sigue ese patrón.
 */
export function riotMatchIdFromFileName(fileName: string): string | null {
  const m = /^([A-Za-z]{2,5}\d?)-(\d+)/.exec(fileName)
  return m ? `${m[1].toUpperCase()}-${m[2]}` : null
}

export function sha256(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex')
}
