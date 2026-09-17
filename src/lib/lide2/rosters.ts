/**
 * The shape of the signup sheets, and the checks run before seeding them.
 *
 * The sheets hold legal names of real people, so they are not committed:
 * `npm run seed:lide2` reads them from `private/rosters.json` (ignored by git),
 * keyed by team number:
 *
 *   { "1": [{ "name": "Surname, Name", "university": "UNLP" }, ...], ... }
 *
 * Names are kept as the sheet writes them; `team_roster.display_name` lets an
 * admin tidy them without losing the original. These are signups, not the Riot
 * accounts in `players`; the two are linked by hand from the admin panel.
 */

import { TEAMS, type UniversityTag } from './tournament'

export interface RosterEntry {
  /** As it appears on the sheet, untouched. */
  name: string
  university: UniversityTag
}

/** Signups by team number, substitutes included. */
export type Rosters = Record<number, RosterEntry[]>

/**
 * Where the sheets disagree with the teams in tournament.ts: a missing or
 * unknown team, a signup count other than the declared one, a university the
 * team does not declare (or declares with nobody), an empty name, or the same
 * name on two teams. Empty when the sheets are consistent.
 */
export function rosterProblems(rosters: Rosters): string[] {
  const problems: string[] = []
  const teamOf = new Map<string, number>()

  for (const number of Object.keys(rosters).map(Number)) {
    if (!TEAMS.some((team) => team.number === number)) {
      problems.push(`team ${number} does not exist`)
    }
  }

  for (const team of TEAMS) {
    const entries = rosters[team.number]
    if (!entries) {
      problems.push(`team ${team.number} has no roster`)
      continue
    }

    if (entries.length !== team.roster) {
      problems.push(`team ${team.number} has ${entries.length} signups, not ${team.roster}`)
    }

    for (const entry of entries) {
      const name = typeof entry.name === 'string' ? entry.name.trim() : ''
      if (name === '') {
        problems.push(`team ${team.number} has a signup without a name`)
        continue
      }

      if (!team.universities.includes(entry.university)) {
        problems.push(`team ${team.number}: ${name} is from ${entry.university}, not declared`)
      }

      const other = teamOf.get(name.toLowerCase())
      if (other !== undefined) problems.push(`${name} is on teams ${other} and ${team.number}`)
      teamOf.set(name.toLowerCase(), team.number)
    }

    for (const tag of team.universities) {
      if (!entries.some((entry) => entry.university === tag)) {
        problems.push(`team ${team.number} declares ${tag} with no signups`)
      }
    }
  }

  return problems
}
