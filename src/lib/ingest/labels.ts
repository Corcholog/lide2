/**
 * Derives stage, round and date from how replays are organized in folders:
 *
 *   16.05 - FECHA 1 (Replays)/16.05 BLOQUE B/E1vsE4-FECHA1-B.rofl
 *
 * The file's mtime is not the match date (it is when the files were copied),
 * so the date comes from the round's folder. Some files sit in the wrong
 * folder, so the file name wins over the folder.
 *
 * The labels ("Bloque B", "Fecha 1") are stored and displayed, so they are
 * in Spanish.
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
/** Block encoded in the file name: "WINNERS-B-...", "...-FECHA1-B.rofl". */
const BLOCK_IN_NAME_RE = /-([A-D])(?=[-.])/
const FOLDER_DATE_RE = /(\d{2})\.(\d{2})/

function segments(path: string): string[] {
  return path.split(/[/\\]/).filter(Boolean)
}

/**
 * Round -> date, read from folder names ("16.05 - FECHA 1"), so files in the
 * wrong folder still get the right date.
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

  // The file name wins: it is what the players typed.
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
