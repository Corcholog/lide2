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
 * El fixture y los planteles vienen transcriptos a mano de las planillas de la
 * organización, así que lo que se verifica acá es la transcripción: que los
 * cruces cierren un todos contra todos, que nadie juegue dos veces en el mismo
 * turno y que los totales den los mismos números que anunció la organización.
 *
 * Los tres cruces —anuncio, planilla de grupos y planilla de fixture— fueron
 * hechos por gente distinta, así que si dan lo mismo es buena señal.
 */
describe('estructura de la LIDE 2', () => {
  it('tiene 20 equipos numerados del 1 al 20, sin repetir', () => {
    expect(TEAMS).toHaveLength(TOURNAMENT.teams)
    const numbers = TEAMS.map((team) => team.number).sort((a, b) => a - b)
    expect(numbers).toEqual(Array.from({ length: 20 }, (_, i) => i + 1))
  })

  it('reparte 5 equipos en cada uno de los 4 grupos', () => {
    expect(GROUPS).toHaveLength(TOURNAMENT.groups)
    for (const group of GROUPS) {
      expect(teamsOfGroup(group), `grupo ${group}`).toHaveLength(5)
    }
  })

  it('suma los 113 jugadores del anuncio', () => {
    const total = TEAMS.reduce((sum, team) => sum + team.roster, 0)
    expect(total).toBe(TOURNAMENT.players)
  })

  it('usa 13 universidades y todas las que nombran los equipos existen', () => {
    expect(Object.keys(UNIVERSITIES)).toHaveLength(TOURNAMENT.universities)

    const used = new Set(TEAMS.flatMap((team) => team.universities))
    for (const tag of used) {
      expect(UNIVERSITIES[tag], `universidad ${tag}`).toBeDefined()
    }
    // Ninguna sobra: las 13 del anuncio son exactamente las que juegan.
    expect(used.size).toBe(TOURNAMENT.universities)
  })

  it('marca como mezclados sólo a los equipos de inscripción individual', () => {
    for (const team of TEAMS) {
      if (team.universities.length > 1) {
        expect(team.entry, `equipo ${team.number}`).toBe('individual')
      }
    }
    // Cuatro equipos salieron mezclando universidades.
    expect(TEAMS.filter((team) => team.universities.length > 1)).toHaveLength(4)
  })
})

describe('fixture de la fase de grupos', () => {
  const allMatches = SCHEDULE.flatMap((round) => round.matches)

  it('son 40 partidos y ningún cruce se repite', () => {
    expect(allMatches).toHaveLength(40)

    const seen = new Set(allMatches.map(([a, b]) => [a, b].sort((x, y) => x - y).join('-')))
    expect(seen.size).toBe(40)
  })

  it('nunca cruza equipos de grupos distintos', () => {
    for (const [a, b] of allMatches) {
      expect(teamByNumber(a).group, `${a} vs ${b}`).toBe(teamByNumber(b).group)
    }
  })

  it('completa el todos contra todos de cada grupo', () => {
    const seen = new Set(allMatches.map(([a, b]) => [a, b].sort((x, y) => x - y).join('-')))

    for (const group of GROUPS) {
      const numbers = teamsOfGroup(group).map((team) => team.number)
      for (let i = 0; i < numbers.length; i++) {
        for (let j = i + 1; j < numbers.length; j++) {
          const key = [numbers[i], numbers[j]].sort((x, y) => x - y).join('-')
          expect(seen.has(key), `falta ${numbers[i]} vs ${numbers[j]} en el grupo ${group}`).toBe(
            true,
          )
        }
      }
    }
  })

  it('en cada turno juegan 16 equipos y descansan 4, uno por grupo', () => {
    for (const round of SCHEDULE) {
      const label = `fecha ${round.matchday} turno ${round.slot}`
      expect(round.matches, label).toHaveLength(8)

      const playing = round.matches.flat()
      expect(new Set(playing).size, `${label}: alguien juega dos veces`).toBe(16)

      const byes = byesFor(round)
      expect(byes, label).toHaveLength(4)
      for (const group of GROUPS) {
        expect(
          byes.filter((team) => team.group === group),
          `${label}: libres del grupo ${group}`,
        ).toHaveLength(1)
      }
    }
  })

  it('le da a cada equipo 4 partidos y un descanso', () => {
    for (const team of TEAMS) {
      const played = SCHEDULE.filter((round) =>
        round.matches.some(([a, b]) => a === team.number || b === team.number),
      )
      const rested = SCHEDULE.filter((round) =>
        byesFor(round).some((other) => other.number === team.number),
      )

      expect(played, `equipo ${team.number}`).toHaveLength(4)
      expect(rested, `equipo ${team.number}`).toHaveLength(1)
    }
  })

  it('juega todos los turnos un sábado, en las fechas del calendario', () => {
    const groupDates = CALENDAR.filter((milestone) => milestone.phase === 'grupos').map(
      (milestone) => milestone.date.slice(0, 10),
    )

    for (const round of SCHEDULE) {
      const kickoff = new Date(round.kickoff)
      expect(kickoff.getUTCDay(), `fecha ${round.matchday} turno ${round.slot}`).toBe(6)
      expect(groupDates).toContain(kickoff.toISOString().slice(0, 10))
    }
  })
})

describe('planteles', () => {
  it('tiene plantel para los 20 equipos', () => {
    for (const team of TEAMS) {
      expect(ROSTERS[team.number], `equipo ${team.number}`).toBeDefined()
    }
    expect(Object.keys(ROSTERS)).toHaveLength(TOURNAMENT.teams)
  })

  it('suma 113 inscriptos, que es lo que anuncio la organizacion', () => {
    const total = Object.values(ROSTERS).reduce((sum, entries) => sum + entries.length, 0)
    expect(total).toBe(TOURNAMENT.players)
  })

  it('coincide con la cantidad de inscriptos que declara cada equipo', () => {
    for (const team of TEAMS) {
      expect(ROSTERS[team.number], `equipo ${team.number}`).toHaveLength(team.roster)
    }
  })

  it('no inventa universidades ni deja fuera ninguna del equipo', () => {
    for (const team of TEAMS) {
      const enPlantel = new Set(ROSTERS[team.number].map((entry) => entry.university))

      for (const tag of enPlantel) {
        expect(UNIVERSITIES[tag], `universidad ${tag}`).toBeDefined()
        expect(team.universities, `equipo ${team.number} no declara ${tag}`).toContain(tag)
      }
      // Y al reves: lo que declara el equipo tiene que estar en el plantel.
      for (const tag of team.universities) {
        expect(enPlantel, `equipo ${team.number} declara ${tag} sin jugadores`).toContain(tag)
      }
    }
  })

  it('pone primera la universidad mas representada del equipo', () => {
    for (const team of TEAMS) {
      const conteo = new Map<string, number>()
      for (const entry of ROSTERS[team.number]) {
        conteo.set(entry.university, (conteo.get(entry.university) ?? 0) + 1)
      }

      const masJugadores = Math.max(...conteo.values())
      expect(conteo.get(team.universities[0]), `equipo ${team.number}`).toBe(masJugadores)
    }
  })

  it('no deja nombres vacios ni con la sigla de la universidad pegada', () => {
    for (const [number, entries] of Object.entries(ROSTERS)) {
      for (const entry of entries) {
        expect(entry.name.trim(), `equipo ${number}`).not.toBe('')
        expect(entry.name, `equipo ${number}: ${entry.name}`).toBe(entry.name.trim())
        // "ZemelkaUNAHUR" era un artefacto de copiar la planilla.
        expect(entry.name, `equipo ${number}: ${entry.name}`).not.toMatch(
          new RegExp(`[a-z]${entry.university}$`),
        )
      }
    }
  })

  it('no repite a la misma persona en dos equipos', () => {
    const vistos = new Map<string, string>()
    for (const [number, entries] of Object.entries(ROSTERS)) {
      for (const entry of entries) {
        const clave = entry.name.toLowerCase()
        expect(vistos.has(clave), `${entry.name} figura en ${vistos.get(clave)} y en ${number}`).toBe(
          false,
        )
        vistos.set(clave, number)
      }
    }
  })
})
