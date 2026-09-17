import { describe, expect, it } from 'vitest'
import { rosterProblems, type Rosters } from '@/lib/lide2/rosters'
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
  type UniversityTag,
} from '@/lib/lide2/tournament'

/**
 * The fixture is transcribed by hand from the organizers' sheets, so this
 * checks the transcription: a complete round robin, nobody playing twice in a
 * slot, and totals matching the announced numbers.
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
    // Exactly the announced universities are used, none extra.
    expect(used.size).toBe(TOURNAMENT.universities)
  })

  it('marks only the individually-signed-up teams as mixed', () => {
    for (const team of TEAMS) {
      if (team.universities.length > 1) {
        expect(team.entry, `team ${team.number}`).toBe('individual')
      }
    }
    // Four teams mix universities.
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

describe('signup sheet checks', () => {
  /** A consistent sheet with made-up names: each team's count, over its universities. */
  function sheet(): Rosters {
    return Object.fromEntries(
      TEAMS.map((team) => [
        team.number,
        Array.from({ length: team.roster }, (_, index) => ({
          name: `Inscripto ${team.number}-${index + 1}`,
          university: team.universities[index % team.universities.length],
        })),
      ]),
    )
  }

  it('accepts a sheet that matches the declared teams', () => {
    expect(rosterProblems(sheet())).toEqual([])
  })

  it('reports a missing team and one that does not exist', () => {
    const rosters = sheet()
    rosters[21] = rosters[1]
    delete rosters[1]

    expect(rosterProblems(rosters)).toEqual(
      expect.arrayContaining(['team 21 does not exist', 'team 1 has no roster']),
    )
  })

  it('reports a wrong count, an undeclared university and an empty name', () => {
    const team = TEAMS.find((candidate) => candidate.universities.length === 1)!
    const elsewhere = Object.keys(UNIVERSITIES).find((tag) => tag !== team.universities[0])!
    const rosters = sheet()
    rosters[team.number] = [
      ...rosters[team.number].slice(1),
      { name: '  ', university: team.universities[0] },
      { name: 'Nombre Ficticio', university: elsewhere as UniversityTag },
    ]

    expect(rosterProblems(rosters)).toEqual(
      expect.arrayContaining([
        `team ${team.number} has ${team.roster + 1} signups, not ${team.roster}`,
        `team ${team.number} has a signup without a name`,
        expect.stringContaining('Nombre Ficticio is from'),
      ]),
    )
  })

  it('reports the same person on two teams, ignoring case', () => {
    const rosters = sheet()
    rosters[2][0] = { ...rosters[2][0], name: rosters[1][0].name.toUpperCase() }

    expect(rosterProblems(rosters)).toContain('INSCRIPTO 1-1 is on teams 1 and 2')
  })
})
