import { describe, expect, it } from 'vitest'
import { ROSTERS } from '@/lib/lide2/rosters'
import {
  CALENDAR,
  GROUPS,
  SCHEDULE,
  TEAMS,
  TOURNAMENT,
  UNIVERSITIES,
  byesFor,
  teamByNumber,
  teamsOfGroup,
} from '@/lib/lide2/tournament'

/**
 * The fixture and the rosters are transcribed by hand from the organizers'
 * sheets, so what gets verified here is the transcription: that the matchups
 * add up to a complete round robin, that nobody plays twice in the same slot
 * and that the totals give the same numbers the organizers announced.
 *
 * The three sources - the announcement, the groups sheet and the fixture sheet
 * - were produced by different people, so if they agree that is a good sign.
 */
describe('LIDE 2 structure', () => {
  it('has 20 teams numbered 1 to 20, with no repeats', () => {
    expect(TEAMS).toHaveLength(TOURNAMENT.teams)
    const numbers = TEAMS.map((team) => team.number).sort((a, b) => a - b)
    expect(numbers).toEqual(Array.from({ length: 20 }, (_, i) => i + 1))
  })

  it('puts 5 teams in each of the 4 groups', () => {
    expect(GROUPS).toHaveLength(TOURNAMENT.groups)
    for (const group of GROUPS) {
      expect(teamsOfGroup(group), `grupo ${group}`).toHaveLength(5)
    }
  })

  it('adds up to the 113 players from the announcement', () => {
    const total = TEAMS.reduce((sum, team) => sum + team.roster, 0)
    expect(total).toBe(TOURNAMENT.players)
  })

  it('uses 13 universities and every one the teams name exists', () => {
    expect(Object.keys(UNIVERSITIES)).toHaveLength(TOURNAMENT.universities)

    const used = new Set(TEAMS.flatMap((team) => team.universities))
    for (const tag of used) {
      expect(UNIVERSITIES[tag], `universidad ${tag}`).toBeDefined()
    }
    // None is spare: the 13 from the announcement are exactly the ones playing.
    expect(used.size).toBe(TOURNAMENT.universities)
  })

  it('marks only the individually-signed-up teams as mixed', () => {
    for (const team of TEAMS) {
      if (team.universities.length > 1) {
        expect(team.entry, `team ${team.number}`).toBe('individual')
      }
    }
    // Four teams came out mixing universities.
    expect(TEAMS.filter((team) => team.universities.length > 1)).toHaveLength(4)
  })
})

describe('group-phase fixture', () => {
  const allMatches = SCHEDULE.flatMap((round) => round.matches)

  it('is 40 games and no matchup repeats', () => {
    expect(allMatches).toHaveLength(40)

    const seen = new Set(allMatches.map(([a, b]) => [a, b].sort((x, y) => x - y).join('-')))
    expect(seen.size).toBe(40)
  })

  it('never crosses teams from different groups', () => {
    for (const [a, b] of allMatches) {
      expect(teamByNumber(a).group, `${a} vs ${b}`).toBe(teamByNumber(b).group)
    }
  })

  it("completes each group's round robin", () => {
    const seen = new Set(allMatches.map(([a, b]) => [a, b].sort((x, y) => x - y).join('-')))

    for (const group of GROUPS) {
      const numbers = teamsOfGroup(group).map((team) => team.number)
      for (let i = 0; i < numbers.length; i++) {
        for (let j = i + 1; j < numbers.length; j++) {
          const key = [numbers[i], numbers[j]].sort((x, y) => x - y).join('-')
          expect(seen.has(key), `missing ${numbers[i]} vs ${numbers[j]} in group ${group}`).toBe(
            true,
          )
        }
      }
    }
  })

  it('in each slot 16 teams play and 4 rest, one per group', () => {
    for (const round of SCHEDULE) {
      const label = `matchday ${round.matchday} turno ${round.slot}`
      expect(round.matches, label).toHaveLength(8)

      const playing = round.matches.flat()
      expect(new Set(playing).size, `${label}: alguien juega dos veces`).toBe(16)

      const byes = byesFor(round)
      expect(byes, label).toHaveLength(4)
      for (const group of GROUPS) {
        expect(
          byes.filter((team) => team.group === group),
          `${label}: byes in group ${group}`,
        ).toHaveLength(1)
      }
    }
  })

  it('gives every team 4 games and one bye', () => {
    for (const team of TEAMS) {
      const played = SCHEDULE.filter((round) =>
        round.matches.some(([a, b]) => a === team.number || b === team.number),
      )
      const rested = SCHEDULE.filter((round) =>
        byesFor(round).some((other) => other.number === team.number),
      )

      expect(played, `team ${team.number}`).toHaveLength(4)
      expect(rested, `team ${team.number}`).toHaveLength(1)
    }
  })

  it("plays every slot on a Saturday, on the calendar's dates", () => {
    const groupDates = CALENDAR.filter((milestone) => milestone.phase === 'grupos').map(
      (milestone) => milestone.date.slice(0, 10),
    )

    for (const round of SCHEDULE) {
      const kickoff = new Date(round.kickoff)
      expect(kickoff.getUTCDay(), `matchday ${round.matchday} turno ${round.slot}`).toBe(6)
      expect(groupDates).toContain(kickoff.toISOString().slice(0, 10))
    }
  })
})

describe('rosters', () => {
  it('has a roster for all 20 teams', () => {
    for (const team of TEAMS) {
      expect(ROSTERS[team.number], `team ${team.number}`).toBeDefined()
    }
    expect(Object.keys(ROSTERS)).toHaveLength(TOURNAMENT.teams)
  })

  it('adds up to 113 signups, which is what the organizers announced', () => {
    const total = Object.values(ROSTERS).reduce((sum, entries) => sum + entries.length, 0)
    expect(total).toBe(TOURNAMENT.players)
  })

  it('matches the signup count each team declares', () => {
    for (const team of TEAMS) {
      expect(ROSTERS[team.number], `team ${team.number}`).toHaveLength(team.roster)
    }
  })

  it("invents no universities and leaves none of the team's out", () => {
    for (const team of TEAMS) {
      const onRoster = new Set(ROSTERS[team.number].map((entry) => entry.university))

      for (const tag of onRoster) {
        expect(UNIVERSITIES[tag], `universidad ${tag}`).toBeDefined()
        expect(team.universities, `team ${team.number} no declara ${tag}`).toContain(tag)
      }
      // And the other way round: what the team declares has to be on the roster.
      for (const tag of team.universities) {
        expect(onRoster, `team ${team.number} declares ${tag} with no players`).toContain(tag)
      }
    }
  })

  it("puts the team's most represented university first", () => {
    for (const team of TEAMS) {
      const conteo = new Map<string, number>()
      for (const entry of ROSTERS[team.number]) {
        conteo.set(entry.university, (conteo.get(entry.university) ?? 0) + 1)
      }

      const masJugadores = Math.max(...conteo.values())
      expect(conteo.get(team.universities[0]), `team ${team.number}`).toBe(masJugadores)
    }
  })

  it('leaves no empty names and none with the university tag stuck on', () => {
    for (const [number, entries] of Object.entries(ROSTERS)) {
      for (const entry of entries) {
        expect(entry.name.trim(), `team ${number}`).not.toBe('')
        expect(entry.name, `team ${number}: ${entry.name}`).toBe(entry.name.trim())
        // "ZemelkaUNAHUR" was an artefact of copying the sheet.
        expect(entry.name, `team ${number}: ${entry.name}`).not.toMatch(
          new RegExp(`[a-z]${entry.university}$`),
        )
      }
    }
  })

  it('does not repeat the same person across two teams', () => {
    const seen = new Map<string, string>()
    for (const [number, entries] of Object.entries(ROSTERS)) {
      for (const entry of entries) {
        const key = entry.name.toLowerCase()
        expect(seen.has(key), `${entry.name} appears in ${seen.get(key)} and in ${number}`).toBe(
          false,
        )
        seen.set(key, number)
      }
    }
  })
})
