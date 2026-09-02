/**
 * Pasting whatever list of Riot IDs the organizers send.
 *
 * There is no telling what format it will arrive in. It could be any of these:
 *
 *   Equipo 15, Denis Chang, DenisChang#LAN
 *   Denis Chang; DenisChang#LAN
 *   Chang, Denis    DenisChang#LAN
 *   15 | Denis Chang | DenisChang#LAN | titular
 *
 * So instead of demanding a format, the search works differently: each line
 * gives up its Riot ID (the field with a `#`, or the last one) and what is left
 * is used to find the signups whose names are **all** contained in the line.
 * That survives extra columns, different separators and a reversed "Surname,
 * Name", because it compares loose words and not the whole string.
 *
 * It only applies when there is exactly one candidate signup. With two or more
 * the line is reported as ambiguous and nothing is touched: filing somebody's
 * Riot ID under somebody else's row is a mistake that goes unseen afterwards.
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
 * The words of a text, made comparable.
 *
 * Without accents (the spreadsheet has them and the lists that arrive over
 * WhatsApp do not) and without punctuation, so "Chang, Denis" and "Denis Chang"
 * come out the same.
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

  // The field with a '#' is unambiguously the Riot ID. When there is none, the
  // last one is taken, which is where it usually sits.
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
