import type { FixtureResultRow, GroupStandingRow } from '@/types/db'

/**
 * Who can still end up in each quarter-final slot, read off the group table and
 * the games it has left.
 *
 * The bracket stores its quarters with the slot written down - "1º A", "2º B" -
 * and the team filled in once the group phase closes (`seedQuarters`, in the
 * seed). Until then the whole bracket shows eight placeholders, which is
 * precisely the moment a visitor most wants to look at it: on the last matchday
 * half the slots are already settled and the other half come down to two games.
 *
 * So the slot gets projected. Every way the remaining games can go is played
 * out, and each slot ends up with either ONE team - it lands there in every
 * single scenario, so nothing that is left to play can take it away - or the
 * list of the teams that can still get there. Nothing here is a guess or a
 * probability: a name only replaces a placeholder when the arithmetic leaves no
 * other outcome.
 *
 * THE RULEBOOK'S TIEBREAK IS THE HEAD TO HEAD (2.2): the two teams with the
 * most points in each group go through, level teams are separated by the game
 * between them, and whatever that still leaves level the organizers decide.
 *
 * That is what makes this worth drawing. A tiebreak on kill difference could
 * never be projected - a scenario says WHO wins a game, not by how much, so two
 * teams level on record would stay unresolved until the last replay was
 * uploaded. The head to head is the opposite: it is always known. Either those
 * two have already played, or the game between them is one of the ones being
 * played out, and then the scenario itself says who won it. Two teams level on
 * points are separated in every scenario, every time.
 *
 * WHAT IS LEFT TO THE ORGANIZERS. Three or more teams level are read as a mini
 * league: their games against each other, counted only among themselves, which
 * is the natural reading of "enfrentamiento directo" and reduces to exactly the
 * head to head when there are two of them. What that does not separate - three
 * teams in a cycle, each beating the next - is left unresolved on purpose, and
 * the slot shows them all as possibles. The rulebook hands that case to the
 * organizers, and inventing a rule they never wrote is how the bracket would
 * end up printing a name that the organizers then overrule.
 */

/** How many of each group go through. It is what "qualified" means here. */
export const QUALIFYING_PLACES = 2

/**
 * Ceiling on the branching: one bit per undecided game, so a group of five -
 * ten games - is at most 1024 scenarios and the four groups together take under
 * a millisecond. It guards against a format nobody has played yet: a group of
 * eight is 28 games and 2^28 scenarios, and the page would hang instead of
 * showing a bracket. Over the ceiling the group is not projected at all and its
 * slots go back to showing the placeholder, which is the honest answer.
 */
const MAX_SCENARIOS = 1 << 14

/** A team that can still take a bracket slot. */
export interface SlotCandidate {
  teamId: string
  teamName: string
  /**
   * In how many of the scenarios it lands in this slot. It is what orders the
   * list - whoever gets there more ways, first - and not a probability: the
   * scenarios are not equally likely.
   */
  scenarios: number
  /** It finishes in the top two however the rest of the group goes. */
  qualified: boolean
}

/** One place of one group - "1º A" - and who can hold it. */
export interface SlotProjection {
  /** The place the bracket asks for: 1 or 2. */
  position: number
  /** The group's letter, the way the slot label writes it. */
  group: string
  /**
   * How many teams the group has. It is what tells a list of possibles that
   * narrows something down from one that does not: before the first matchday
   * every team can come first, and saying so is not a preview.
   */
  teams: number
  /** Games of the group still to be decided. Zero means the table is final. */
  pending: number
  /** How many ways the group can still end: two to the power of `pending`. */
  scenarios: number
  /**
   * The team that takes the slot in every one of them, or null while more than
   * one still can. When it is set, `candidates` holds exactly that team.
   */
  locked: SlotCandidate | null
  /** Everyone who can still take it, the one with the most scenarios first. */
  candidates: SlotCandidate[]
}

/** A team in the running, with what the table has already counted for it. */
interface Contender {
  teamId: string
  teamName: string
  wins: number
  losses: number
  /** Its place in today's table, which orders candidates level on scenarios. */
  position: number
}

/** A group: its teams, the games already played and the ones still open. */
interface Ladder {
  group: string
  teams: Contender[]
  /** Games with a winner, as [winner, loser] pairs of indexes into `teams`. */
  decided: [number, number][]
  /** Games still to be decided, as pairs of indexes. One bit of a scenario each. */
  pending: [number, number][]
}

/** What all the scenarios together say about one team. */
interface Outlook {
  /** How many scenarios put it in each position. */
  reach: Map<number, number>
  /** The highest and the lowest it can finish. Equal = it has only one place. */
  best: number
  worst: number
}

/**
 * The projection for every place of every group.
 *
 * It takes the two things the home page already holds - the table and the
 * fixture - so it costs no extra query. `forSlot` goes from a series' slot
 * label to its entry here.
 */
export function projectBracketSlots(
  standings: GroupStandingRow[],
  fixture: FixtureResultRow[],
): SlotProjection[] {
  const projection: SlotProjection[] = []

  for (const ladder of ladders(standings, fixture)) {
    const outlook = outlooks(ladder)
    if (!outlook) continue

    for (let position = 1; position <= ladder.teams.length; position += 1) {
      const reachable = ladder.teams
        .map((team, index) => ({ team, look: outlook[index] }))
        .filter(({ look }) => (look.reach.get(position) ?? 0) > 0)
        .sort(
          (a, b) =>
            (b.look.reach.get(position) ?? 0) - (a.look.reach.get(position) ?? 0) ||
            a.team.position - b.team.position ||
            a.team.teamName.localeCompare(b.team.teamName),
        )

      const candidates: SlotCandidate[] = reachable.map(({ team, look }) => ({
        teamId: team.teamId,
        teamName: team.teamName,
        scenarios: look.reach.get(position) ?? 0,
        qualified: look.worst <= QUALIFYING_PLACES,
      }))

      // Settled is not the same as being the only candidate: it is having no
      // other place left to finish in, and that is what a name written into the
      // bracket has to rest on.
      const settled = reachable.find(({ look }) => look.best === position && look.worst === position)

      projection.push({
        position,
        group: ladder.group,
        teams: ladder.teams.length,
        pending: ladder.pending.length,
        scenarios: 1 << ladder.pending.length,
        locked: candidates.find((entry) => entry.teamId === settled?.team.teamId) ?? null,
        candidates,
      })
    }
  }

  return projection
}

/**
 * The projection a series' slot asks for: "1º A" is the first place of group A.
 *
 * By number and letter and not by the exact text, the same way `seedQuarters`
 * reads those labels, so it survives somebody rewriting one - "1ro A", "1° A".
 */
export function forSlot(
  projection: SlotProjection[],
  label: string | null,
): SlotProjection | undefined {
  const place = label?.match(/^\s*(\d+)\D*?([A-Za-z])\s*$/)
  if (!place) return undefined

  const position = Number(place[1])
  const group = place[2].toUpperCase()

  return projection.find((slot) => slot.position === position && slot.group === group)
}

/**
 * Buckets the table into groups and hangs each group's games off it.
 *
 * The group comes out of its label's last letter - "Grupo A" - which is how the
 * seed pairs the two up as well. The games are located by team and not by their
 * own label: both sides of a matchup sit in the same group by construction, and
 * a fixture whose teams are not in the table belongs to no group being
 * projected.
 *
 * The games that ARE decided are kept too, which they did not use to be. The
 * wins they are worth were already counted by the table, but the head to head
 * needs to know who beat whom, and that is nowhere in an aggregate.
 */
function ladders(standings: GroupStandingRow[], fixture: FixtureResultRow[]): Ladder[] {
  const byGroup = new Map<string, Ladder>()
  const placed = new Map<string, { ladder: Ladder; index: number }>()

  for (const row of standings) {
    const group = row.group_label.trim().slice(-1).toUpperCase()
    const ladder = byGroup.get(group) ?? { group, teams: [], decided: [], pending: [] }
    byGroup.set(group, ladder)

    placed.set(row.team_id, { ladder, index: ladder.teams.length })
    ladder.teams.push({
      teamId: row.team_id,
      teamName: row.team_name,
      wins: row.wins,
      losses: row.losses,
      position: row.position,
    })
  }

  for (const row of fixture) {
    const a = placed.get(row.team_a_id)
    const b = placed.get(row.team_b_id)
    if (!a || !b || a.ladder !== b.ladder) continue

    // A walkover has a winner and no match, and `winner_team_id` carries it:
    // the team that did not turn up lost the game for every purpose, the head
    // to head included.
    if (row.winner_team_id === null) {
      a.ladder.pending.push([a.index, b.index])
    } else if (row.winner_team_id === row.team_a_id) {
      a.ladder.decided.push([a.index, b.index])
    } else if (row.winner_team_id === row.team_b_id) {
      a.ladder.decided.push([b.index, a.index])
    }
  }

  return [...byGroup.values()].sort((a, b) => a.group.localeCompare(b.group))
}

/**
 * Plays out every scenario and collects, for each team, the places it can
 * finish in.
 *
 * One bit of the counter per undecided game: set means the second team won.
 * That walks every combination exactly once, and the arrays are written over
 * instead of rebuilt so a thousand scenarios do not leave thousands of objects
 * behind.
 *
 * Null when the group branches past the ceiling.
 */
function outlooks(ladder: Ladder): Outlook[] | null {
  const scenarios = 1 << ladder.pending.length
  if (scenarios > MAX_SCENARIOS) return null

  const size = ladder.teams.length
  const outlook: Outlook[] = ladder.teams.map(() => ({ reach: new Map(), best: size, worst: 1 }))

  const wins = new Array<number>(size)
  const losses = new Array<number>(size)
  /** Wins against the teams level with it: the mini league that breaks the tie. */
  const head = new Array<number>(size)

  // Who beat whom, flattened: `beat[i * size + j]` is "i won the game against
  // j". The games already played are the same in every scenario, so they are
  // laid down once and copied over each time.
  const played = new Uint8Array(size * size)
  for (const [winner, loser] of ladder.decided) played[winner * size + loser] = 1
  const beat = new Uint8Array(size * size)

  for (let scenario = 0; scenario < scenarios; scenario += 1) {
    for (let index = 0; index < size; index += 1) {
      wins[index] = ladder.teams[index].wins
      losses[index] = ladder.teams[index].losses
    }
    beat.set(played)

    ladder.pending.forEach(([a, b], bit) => {
      const winner = (scenario >> bit) & 1 ? b : a
      const loser = winner === a ? b : a
      wins[winner] += 1
      losses[loser] += 1
      beat[winner * size + loser] = 1
    })

    /*
     * The mini league, counted only among the teams that share a record. Two
     * teams level have the same set of rivals to count against - each other's
     * level group is the same group - so the two figures are comparable, which
     * is what lets them be used as a plain sort key.
     */
    for (let index = 0; index < size; index += 1) {
      let won = 0
      for (let other = 0; other < size; other += 1) {
        if (other === index) continue
        if (wins[other] !== wins[index] || losses[other] !== losses[index]) continue
        if (beat[index * size + other]) won += 1
      }
      head[index] = won
    }

    for (let index = 0; index < size; index += 1) {
      let ahead = 0
      let level = 0

      for (let other = 0; other < size; other += 1) {
        if (other === index) continue

        if (wins[other] !== wins[index]) {
          if (wins[other] > wins[index]) ahead += 1
        } else if (losses[other] !== losses[index]) {
          if (losses[other] < losses[index]) ahead += 1
        } else if (head[other] > head[index]) {
          ahead += 1
        } else if (head[other] === head[index]) {
          // Level on points and level on the games between them: this is the
          // one the rulebook hands to the organizers.
          level += 1
        }
      }

      // Everyone above it is a place taken; everyone it cannot be separated
      // from is a place it might lose. Between the two is where it can finish.
      const best = ahead + 1
      const worst = ahead + level + 1
      const look = outlook[index]
      look.best = Math.min(look.best, best)
      look.worst = Math.max(look.worst, worst)
      for (let position = best; position <= worst; position += 1) {
        look.reach.set(position, (look.reach.get(position) ?? 0) + 1)
      }
    }
  }

  return outlook
}
