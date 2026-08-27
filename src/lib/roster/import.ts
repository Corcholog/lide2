/**
 * Pegar la lista de Riot IDs que mande la organización.
 *
 * No se sabe en qué formato va a llegar. Puede ser cualquiera de estos:
 *
 *   Equipo 15, Denis Chang, DenisChang#LAN
 *   Denis Chang; DenisChang#LAN
 *   Chang, Denis    DenisChang#LAN
 *   15 | Denis Chang | DenisChang#LAN | titular
 *
 * Así que en vez de exigir un formato, se busca de otra forma: de cada línea se
 * saca el Riot ID (el campo con `#`, o el último) y con lo que queda se buscan
 * los inscriptos cuyos nombres estén **todos** contenidos en la línea. Eso
 * aguanta columnas de más, separadores distintos y "Apellido, Nombre" dado
 * vuelta, porque compara palabras sueltas y no la cadena entera.
 *
 * Se aplica sólo cuando hay exactamente un inscripto candidato. Con dos o más,
 * la línea se reporta como ambigua y no se toca nada: cargar el Riot ID de
 * alguien en la fila de otro es un error que después no se ve.
 */

import { parseRiotId } from '@/lib/format'

export interface RosterCandidate {
  rosterId: string
  fullName: string
  teamName: string
}

export interface RosterMatch {
  rosterId: string
  fullName: string
  teamName: string
  gameName: string
  tagLine: string | null
}

export interface RosterImportResult {
  matched: RosterMatch[]
  /** Líneas que no encontraron a nadie. */
  unmatched: string[]
  /** Líneas que encontraron a más de uno, con los nombres que colisionaron. */
  ambiguous: { line: string; names: string[] }[]
}

/**
 * Las palabras de un texto, comparables.
 *
 * Sin acentos (la planilla los tiene y las listas que llegan por WhatsApp no) y
 * sin puntuación, para que "Chang, Denis" y "Denis Chang" den lo mismo.
 */
function words(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
}

const SEPARATORS = /[\t;,|]+/

/** Separa el Riot ID del resto de la línea. */
function splitLine(line: string): { riot: string; rest: string } | null {
  const fields = line
    .split(SEPARATORS)
    .map((field) => field.trim())
    .filter(Boolean)

  if (fields.length === 0) return null

  // El campo con '#' es inequívocamente el Riot ID. Si no hay ninguno, se toma
  // el último, que es donde suele ir.
  const index = fields.findLastIndex((field) => field.includes('#'))
  const at = index >= 0 ? index : fields.length - 1

  // Con un solo campo no hay nombre contra el cual buscar.
  if (fields.length < 2) return null

  return { riot: fields[at], rest: fields.filter((_, i) => i !== at).join(' ') }
}

export function matchRosterLines(
  text: string,
  candidates: RosterCandidate[],
): RosterImportResult {
  const result: RosterImportResult = { matched: [], unmatched: [], ambiguous: [] }
  const taken = new Set<string>()

  const indexed = candidates.map((candidate) => ({
    ...candidate,
    words: words(candidate.fullName),
  }))

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue

    const split = splitLine(line)
    const riot = split && parseRiotId(split.riot)

    if (!split || !riot) {
      result.unmatched.push(line)
      continue
    }

    const lineWords = new Set(words(split.rest))
    const hits = indexed.filter(
      (candidate) =>
        !taken.has(candidate.rosterId) &&
        candidate.words.length > 0 &&
        candidate.words.every((word) => lineWords.has(word)),
    )

    if (hits.length === 1) {
      taken.add(hits[0].rosterId)
      result.matched.push({
        rosterId: hits[0].rosterId,
        fullName: hits[0].fullName,
        teamName: hits[0].teamName,
        gameName: riot.gameName,
        tagLine: riot.tagLine,
      })
    } else if (hits.length === 0) {
      result.unmatched.push(line)
    } else {
      result.ambiguous.push({ line, names: hits.map((hit) => hit.fullName) })
    }
  }

  return result
}
