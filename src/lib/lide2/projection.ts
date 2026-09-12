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
 * WHAT IT DOES NOT DECIDE. `group_standings` breaks a tie on wins by kill
 * difference, and a scenario says who wins a game, not by how much. So two
 * teams level on record with a game still to play are left UNRESOLVED against
 * each other, and both come out as candidates for both places. The alternative
 * - carrying today's kill difference over - would print a name that a single
 * bloody game could take away, which is the one thing this must never do. The
 * tiebreak is applied only between two teams that have finished playing, where
 * it cannot move any more: on the last matchday, with one of the two games
 * already uploaded, that is what settles the group.
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
  killDiff: number
  /** Its place in today's table, which orders candidates level on scenarios. */
  position: number
  /** Games of its own left: while it has any, its kill difference can move. */
  pending: number
}

/** A group, with its teams and the matchups still to be decided. */
interface Ladder {
  group: string
  teams: Contender[]
  /** The undecided matchups, as pairs of indexes into `teams`. */
  pending: [number, number][]
}

/** A team's record inside one scenario. */
interface Projected {
  team: Contender
  wins: number
  losses: number
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
      const settled = reachable.find(
        ({ look }) => look.best === position && look.worst === position,
      )

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
 * Buckets the table into groups and hangs the undecided matchups off each one.
 *
 * The group comes out of its label's last letter - "Grupo A" - which is how the
 * seed pairs the two up as well. The matchups are located by team and not by
 * their own label: both sides of a matchup sit in the same group by
 * construction, and a fixture whose teams are not in the table is one that
 * belongs to no group being projected.
 */
function ladders(standings: GroupStandingRow[], fixture: FixtureResultRow[]): Ladder[] {
  const byGroup = new Map<string, Ladder>()
  const placed = new Map<string, { ladder: Ladder; index: number }>()

  for (const row of standings) {
    const group = row.group_label.trim().slice(-1).toUpperCase()
    const ladder = byGroup.get(group) ?? { group, teams: [], pending: [] }
    byGroup.set(group, ladder)

    placed.set(row.team_id, { ladder, index: ladder.teams.length })
    ladder.teams.push({
      teamId: row.team_id,
      teamName: row.team_name,
      wins: row.wins,
      losses: row.losses,
      killDiff: row.kill_diff,
      position: row.position,
      pending: 0,
    })
  }

  for (const row of fixture) {
    // A walkover has a winner and no match, and `winner_team_id` already
    // carries it: what is left over is what can still go either way.
    if (row.winner_team_id !== null) continue

    const a = placed.get(row.team_a_id)
    const b = placed.get(row.team_b_id)
    if (!a || !b || a.ladder !== b.ladder) continue

    a.ladder.pending.push([a.index, b.index])
    a.ladder.teams[a.index].pending += 1
    b.ladder.teams[b.index].pending += 1
  }

  return [...byGroup.values()].sort((a, b) => a.group.localeCompare(b.group))
}

/**
 * Plays out every scenario and collects, for each team, the places it can
 * finish in.
 *
 * One bit of the counter per undecided game: set means the second team won.
 * That walks every combination exactly once, and the rows are written over
 * instead of rebuilt so a thousand scenarios do not leave five thousand
 * objects behind.
 *
 * Null when the group branches past the ceiling.
 */
function outlooks(ladder: Ladder): Outlook[] | null {
  const scenarios = 1 << ladder.pending.length
  if (scenarios > MAX_SCENARIOS) return null

  const table: Projected[] = ladder.teams.map((team) => ({ team, wins: 0, losses: 0 }))
  const outlook: Outlook[] = ladder.teams.map(() => ({
    reach: new Map(),
    best: ladder.teams.length,
    worst: 1,
  }))

  for (let scenario = 0; scenario < scenarios; scenario += 1) {
    for (const row of table) {
      row.wins = row.team.wins
      row.losses = row.team.losses
    }

    ladder.pending.forEach(([a, b], bit) => {
      const winner = (scenario >> bit) & 1 ? b : a
      const loser = winner === a ? b : a
      table[winner].wins += 1
      table[loser].losses += 1
    })

    for (let index = 0; index < table.length; index += 1) {
      let ahead = 0
      let level = 0

      for (let other = 0; other < table.length; other += 1) {
        if (other === index) continue
        const verdict = compare(table[other], table[index])
        if (verdict === 'ahead') ahead += 1
        else if (verdict === 'level') level += 1
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

/** 'level' is not a draw: it is a tie this scenario has no way of breaking. */
type Verdict = 'ahead' | 'behind' | 'level'

/**
 * Does `a` finish above `b`?
 *
 * The same criteria as `group_standings`, in the same order: wins, losses, kill
 * difference, name. The last two are only reachable once neither side has a
 * game left, because a scenario decides who wins and not by how many kills.
 *
 * `localeCompare` stands in for the view's `order by t.name asc`, which runs on
 * the database's collation. For "Equipo 01" against "Equipo 02" the two agree;
 * where they could not - two teams with the same name - the tie is left
 * unbroken rather than guessed.
 */
function compare(a: Projected, b: Projected): Verdict {
  if (a.wins !== b.wins) return a.wins > b.wins ? 'ahead' : 'behind'
  if (a.losses !== b.losses) return a.losses < b.losses ? 'ahead' : 'behind'
  if (a.team.pending > 0 || b.team.pending > 0) return 'level'

  if (a.team.killDiff !== b.team.killDiff) {
    return a.team.killDiff > b.team.killDiff ? 'ahead' : 'behind'
  }

  const byName = a.team.teamName.localeCompare(b.team.teamName)
  return byName === 0 ? 'level' : byName < 0 ? 'ahead' : 'behind'
}
