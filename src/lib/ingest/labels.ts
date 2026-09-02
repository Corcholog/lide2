/**
 * Derives stage, round and date from the way the teams organize their replays
 * into folders.
 *
 * The real group-phase structure is:
 *
 *   16.05 - FECHA 1 (Replays)/16.05 BLOQUE B/E1vsE4-LEIF8-FECHA1-B.rofl
 *
 * Two things learned from the actual files:
 *
 *  - The mtime is NO use as the match date: every FECHA 1 file falls inside a
 *    20-minute window on the following day, which is when the files were
 *    copied. The folder's date is the round's official date.
 *  - Some files are filed wrong ("Fecha 3 ..." inside the FECHA 2 folder), so
 *    the file name beats the folder, and the date comes from the round and not
 *    from whichever folder it ended up in.
 *
 * The labels this produces ("Bloque B", "Fecha 1") are stored and displayed as
 * they are, so they stay in Spanish.
 */

export interface DerivedLabels {
  /** Group-phase block: "Bloque B". */
  stageLabel: string | null
  /** Tournament matchday: "Fecha 1". */
  roundLabel: string | null
  round: number | null
  playedAt: Date | null
}

const ROUND_RE = /FECHA\s*(\d+)/i
const BLOCK_RE = /BLOQUE\s*([A-D])\b/i
/** Block encoded in the name: "WINNERS-B-LEIF8", "...-FECHA1-B.rofl". */
const BLOCK_IN_NAME_RE = /-([A-D])(?=[-.])/
const FOLDER_DATE_RE = /(\d{2})\.(\d{2})/

function segments(path: string): string[] {
  return path.split(/[/\\]/).filter(Boolean)
}

/**
 * Round -> date map, read from the folder names ("16.05 - FECHA 1"). It dates
 * even the files that ended up in the wrong folder correctly.
 */
export function buildRoundDateMap(paths: string[], year: number): Map<number, Date> {
  const map = new Map<number, Date>()

  for (const path of paths) {
    for (const segment of segments(path)) {
      const round = ROUND_RE.exec(segment)
      const date = FOLDER_DATE_RE.exec(segment)
      if (!round || !date) continue

      const key = Number(round[1])
      if (!map.has(key)) {
        map.set(key, new Date(Date.UTC(year, Number(date[2]) - 1, Number(date[1]), 12)))
      }
    }
  }

  return map
}

export function deriveLabels(path: string, roundDates: Map<number, Date>): DerivedLabels {
  const parts = segments(path)
  const fileName = parts[parts.length - 1] ?? path
  const folders = parts.slice(0, -1)

  // The file name wins: it is what whoever played the match typed.
  const roundMatch = ROUND_RE.exec(fileName) ?? ROUND_RE.exec(folders.join(' '))
  const round = roundMatch ? Number(roundMatch[1]) : null

  const blockMatch =
    BLOCK_RE.exec(folders.join(' ')) ?? BLOCK_RE.exec(fileName) ?? BLOCK_IN_NAME_RE.exec(fileName)
  const block = blockMatch ? blockMatch[1].toUpperCase() : null

  let playedAt: Date | null = round !== null ? (roundDates.get(round) ?? null) : null

  if (!playedAt) {
    for (const folder of folders) {
      const date = FOLDER_DATE_RE.exec(folder)
      if (date) {
        const year = new Date().getUTCFullYear()
        playedAt = new Date(Date.UTC(year, Number(date[2]) - 1, Number(date[1]), 12))
        break
      }
    }
  }

  return {
    stageLabel: block ? `Bloque ${block}` : null,
    roundLabel: round !== null ? `Fecha ${round}` : null,
    round,
    playedAt,
  }
}
