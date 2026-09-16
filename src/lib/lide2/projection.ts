import type { FixtureResultRow, GroupStandingRow } from '@/types/db'

/**
 * Who can still end up in each quarter-final slot ("1º A"), worked out from the
 * group table and the games left to play.
 *
 * Every remaining result is played out. A slot is `locked` only when the same
 * team lands there in every scenario; otherwise it lists every team that can
 * still get there. Nothing here is a probability.
 *
 * Ties follow the rulebook (2.2): points first, then the head to head. With
 * three or more teams level, only the games among them count (a mini league).
 * A tie that still cannot be separated, such as three teams beating each other
 * in a cycle, is left open, because the rulebook leaves it to the organizers.
 */

/** How many teams of each group go through. */
export const QUALIFYING_PLACES = 2

/**
 * Upper bound on scenarios (one bit per undecided game). A group of five has
 * ten games, at most 1024 scenarios. Groups above the bound are not projected
 * and their slots keep the placeholder.
 */
const MAX_SCENARIOS = 1 << 14

/** A team that can still take a bracket slot. */
export interface SlotCandidate {
  teamId: string
  teamName: string
  /**
   * How many scenarios put it in this slot. Used to order the list; it is not
   * a probability, because scenarios are not equally likely.
   */
  scenarios: number
  /** It finishes in the top two however the rest of the group goes. */
  qualified: boolean
  /**
   * It has played all its group games. This is not the same as the slot being
   * settled: a team can be out of reach with a game left, or finished while
   * the place is still open.
   */
  finished: boolean
}

/** One place of one group - "1º A" - and who can hold it. */
export interface SlotProjection {
  /** The place the bracket asks for: 1 or 2. */
  position: number
  /** The group's letter, the way the slot label writes it. */
  group: string
  /**
   * How many teams the group has, to tell a list of candidates that narrows
   * things down from one that names the whole group.
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
  /** Games of its own still to be played. */
  pending: number
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
 * The projection for every place of every group, from the data the home page
 * already loads. Use `forSlot` to find a series' slot in the result.
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
        finished: team.pending === 0,
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
 * The projection for a series' slot label: "1º A" is first place in group A.
 *
 * Matches on the number and the letter, like `seedQuarters`, so variants such
 * as "1ro A" or "1° A" also work.
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
 * Splits the table into groups and attaches each group's games.
 *
 * The group is the last letter of its label ("Grupo A"). Games are matched by
 * team: both sides of a matchup are always in the same group. Decided games are
 * kept too, because the head to head needs to know who beat whom.
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
      pending: 0,
    })
  }

  for (const row of fixture) {
    const a = placed.get(row.team_a_id)
    const b = placed.get(row.team_b_id)
    if (!a || !b || a.ladder !== b.ladder) continue

    // A walkover has a winner and no match; it counts as a loss for every
    // purpose, head to head included.
    if (row.winner_team_id === null) {
      a.ladder.pending.push([a.index, b.index])
      a.ladder.teams[a.index].pending += 1
      b.ladder.teams[b.index].pending += 1
    } else if (row.winner_team_id === row.team_a_id) {
      a.ladder.decided.push([a.index, b.index])
    } else if (row.winner_team_id === row.team_b_id) {
      a.ladder.decided.push([b.index, a.index])
    }
  }

  return [...byGroup.values()].sort((a, b) => a.group.localeCompare(b.group))
}

/**
 * Plays out every scenario and records the places each team can finish in.
 *
 * Bit n of the scenario counter set means the second team won pending game n.
 * Arrays are reused across scenarios to avoid allocations. Returns null when
 * the group exceeds `MAX_SCENARIOS`.
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

  // Who beat whom: `beat[i * size + j]` means i beat j. Decided games are the
  // same in every scenario, so they are laid down once and copied each time.
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

    // Mini league: wins against teams with the same record. Teams that are
    // level share the same set of rivals, so the counts are comparable.
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
          // Level on points and on the games between them: left to the
          // organizers.
          level += 1
        }
      }

      // Teams ahead take places above it; teams it cannot be separated from
      // are places it might lose. It can finish anywhere in between.
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
