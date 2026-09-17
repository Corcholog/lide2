/**
 * Imports a pasted list of Riot IDs into the signups, whatever its format:
 *
 *   Equipo 15, Dario Ferro, DarioFerro#LAN
 *   Dario Ferro; DarioFerro#LAN
 *   Ferro, Dario    DarioFerro#LAN
 *   15 | Dario Ferro | DarioFerro#LAN | titular
 *
 * Each line gives up its Riot ID (the field with a `#`, or the last field), and
 * the rest must contain every word of exactly one signup's name. This tolerates
 * extra columns, other separators and "Surname, Name". Lines matching several
 * signups are reported as ambiguous and left untouched.
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
  /** Lines that found nobody. */
  unmatched: string[]
  /** Lines that found more than one, with the names that collided. */
  ambiguous: { line: string; names: string[] }[]
}

/**
 * The words of a text, lower case, without accents or punctuation, so
 * "Ferro, Dario" and "Dario Ferro" compare equal.
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

/** Splits the Riot ID off from the rest of the line. */
function splitLine(line: string): { riot: string; rest: string } | null {
  const fields = line
    .split(SEPARATORS)
    .map((field) => field.trim())
    .filter(Boolean)

  if (fields.length === 0) return null

  // A field with '#' is the Riot ID; otherwise it is usually the last field.
  const index = fields.findLastIndex((field) => field.includes('#'))
  const at = index >= 0 ? index : fields.length - 1

  // With a single field there is no name to search against.
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
