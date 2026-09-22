/**
 * The playoff draw, checked before it is written.
 *
 * Rule 2.3 crosses group winners with runners-up through a draw that tries to
 * keep teams of the same university apart. Which winner meets which runner-up
 * is therefore not ours to work out: the organizers make the draw and enter it.
 * What is ours is refusing to record one that cannot be right.
 *
 * The rules live here rather than in the panel or the seed so both check the
 * same thing. Messages are Spanish: the panel shows them as they are.
 */

/** The round the draw decides. The rest of the bracket follows from it. */
export const DRAWN_ROUND = 'Cuartos de final'

/**
 * The line above that round while the draw has not been entered, so the empty
 * slots read as a draw still to be made and not as a fixture nobody filled in.
 */
export const DRAW_NOTE = 'Cruce por sorteo: 1º contra 2º, evitando la misma universidad'

/**
 * What a bracket slot says: where the team comes from, beside its name, or the
 * placeholder while the slot is empty.
 *
 * The drawn round is the exception. Its stored labels are the fixed crossing
 * the seed wrote ("1º A"), which is not how its teams got there, so it says
 * "A sortear" while the slot is empty and nothing at all once the draw put
 * someone in it. Every other round does follow from the bracket, and "Ganador
 * cuartos 1" is as true after the semifinal is filled as before.
 */
export function slotLabel(
  round: string | null,
  stored: string | null,
  filled: boolean,
): string | null {
  if (round === DRAWN_ROUND) return filled ? null : 'A sortear'

  return stored
}

/** Whether the draw is still to be entered: any slot of its round empty. */
export function drawPending(quarters: Pairing[]): boolean {
  return quarters.length > 0 && quarters.some((item) => !item.teamAId || !item.teamBId)
}

/** A team that reached the bracket, as the draw form lists it. */
export interface Qualified {
  teamId: string
  teamName: string
  /** The group's letter, as `group_standings` writes it ("Grupo A" -> "A"). */
  group: string
  /** 1 or 2: a group winner or a runner-up. */
  position: number
  /** Its universities, to point out a pairing the draw meant to avoid. */
  universities: string[]
}

/** One quarter-final, in bracket order. Either side may still be empty. */
export interface Pairing {
  teamAId: string | null
  teamBId: string | null
}

/**
 * What is wrong with a proposed draw, or an empty list.
 *
 * Every problem is reported, not just the first: fixing them one reload at a
 * time over eight selects would be miserable.
 */
export function drawProblems(pairings: Pairing[], qualified: Qualified[]): string[] {
  const problems: string[] = []
  const byId = new Map(qualified.map((team) => [team.teamId, team]))

  const expected = qualified.length / 2
  if (pairings.length !== expected) {
    problems.push(`Son ${expected} cruces y llegaron ${pairings.length}.`)
    return problems
  }

  const used = new Map<string, number>()

  pairings.forEach((pairing, index) => {
    const order = index + 1

    if (!pairing.teamAId || !pairing.teamBId) {
      problems.push(`Al cruce ${order} le falta un equipo.`)
      return
    }

    for (const [id, position] of [
      [pairing.teamAId, 1],
      [pairing.teamBId, 2],
    ] as const) {
      const team = byId.get(id)
      used.set(id, (used.get(id) ?? 0) + 1)

      if (!team) {
        problems.push(`El cruce ${order} tiene un equipo que no clasificó.`)
      } else if (team.position !== position) {
        // The one structural rule the draw does not touch: a group winner
        // always plays a runner-up.
        problems.push(
          `En el cruce ${order}, ${team.teamName} es ${team.position}º de su grupo y va del lado de los ${position}º.`,
        )
      }
    }
  })

  for (const [id, times] of used) {
    if (times > 1) {
      problems.push(`${byId.get(id)?.teamName ?? 'Un equipo'} aparece en ${times} cruces.`)
    }
  }

  const missing = qualified.filter((team) => !used.has(team.teamId))
  if (missing.length > 0 && problems.length === 0) {
    problems.push(`Quedaron afuera: ${missing.map((team) => team.teamName).join(', ')}.`)
  }

  return problems
}

/**
 * The university two teams share, if any.
 *
 * Not an error: the rulebook only asks the draw to avoid it "sujeto a
 * disponibilidad", so a draw can land on one legitimately. The panel says so
 * rather than blocking it, because the organizers are the ones who know
 * whether it could be avoided.
 */
export function sharedUniversity(a: Qualified | undefined, b: Qualified | undefined): string | null {
  if (!a || !b) return null

  return a.universities.find((tag) => b.universities.includes(tag)) ?? null
}
