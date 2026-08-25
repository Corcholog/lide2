/**
 * Deriva etapa, ronda y fecha a partir de cómo los equipos organizan los
 * replays en carpetas.
 *
 * La estructura real de la fase de grupos es:
 *
 *   16.05 - FECHA 1 (Replays)/16.05 BLOQUE B/E1vsE4-LEIF8-FECHA1-B.rofl
 *
 * Dos cosas aprendidas de los archivos de verdad:
 *
 *  - El mtime NO sirve como fecha de partida: los de FECHA 1 caen todos en un
 *    rango de 20 minutos del día siguiente, o sea que es cuando se copiaron los
 *    archivos. La fecha de la carpeta es la fecha oficial de la ronda.
 *  - Hay archivos mal guardados ("Fecha 3 ..." dentro de la carpeta de FECHA 2),
 *    así que el nombre del archivo le gana a la carpeta, y la fecha sale de la
 *    ronda y no de la carpeta donde quedó.
 */

export interface DerivedLabels {
  /** Bloque de la fase de grupos: "Bloque B". */
  stageLabel: string | null
  /** Jornada del torneo: "Fecha 1". */
  roundLabel: string | null
  round: number | null
  playedAt: Date | null
}

const ROUND_RE = /FECHA\s*(\d+)/i
const BLOCK_RE = /BLOQUE\s*([A-D])\b/i
/** Bloque codificado en el nombre: "WINNERS-B-LEIF8", "...-FECHA1-B.rofl". */
const BLOCK_IN_NAME_RE = /-([A-D])(?=[-.])/
const FOLDER_DATE_RE = /(\d{2})\.(\d{2})/

function segments(path: string): string[] {
  return path.split(/[/\\]/).filter(Boolean)
}

/**
 * Mapa ronda -> fecha, leído de los nombres de carpeta ("16.05 - FECHA 1").
 * Sirve para fechar bien incluso los archivos que quedaron en la carpeta
 * equivocada.
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

  // El nombre del archivo manda: es lo que escribió quien jugó la partida.
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
