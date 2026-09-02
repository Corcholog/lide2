/**
 * Detecting teams from who plays alongside whom.
 *
 * With 82 detected players and 29 matches, assigning by hand is not viable.
 * Teams are deduced on their own: the 5 on one side of a match are a team, and
 * two lineups sharing 3 or more players are the same team (the threshold
 * tolerates substitutes without merging different teams).
 *
 * The name comes from the file name: teams write "E1vsE4", so the number that
 * shows up in ALL of a cluster's matches is theirs, and the one that varies is
 * the opponent's.
 */

export interface Lineup {
  matchId: string
  side: 100 | 200
  puuids: string[]
  /** Names of that match's .rofl files, which is where the team name comes from. */
  fileNames: string[]
}

export interface DetectedTeam {
  /** Every player seen in the team, most frequent first. */
  puuids: string[]
  /** How many lineups were merged into this one. */
  lineups: number
  matchIds: string[]
  suggestedName: string | null
  /** How many matches each player played with this team. */
  appearances: Record<string, number>
}

/** Two lineups are the same team when they share at least this many players. */
const SHARED_THRESHOLD = 3

/**
 * "E1vsE4", "WINNERS(E2vsE11)", "E8vsE15-LEIF8". A \b after the number is no
 * use because in "E1vsE4" there is no break between the 1 and the v; what
 * follows is required to be "vs" or something non-alphanumeric. The E has to
 * sit at the start or after a separator, so "LEIF8" does not count.
 */
const TEAM_TOKEN_RE = /(?:^|[^A-Za-z0-9]|vs)E(\d{1,2})(?=vs|$|[^A-Za-z0-9])/gi
/** "Fecha 3 Equipo 2 vs Equipo 9.rofl" */
const TEAM_WORD_RE = /Equipo\s*(\d{1,2})/gi

function shared(a: Set<string>, b: string[]): number {
  return b.filter((puuid) => a.has(puuid)).length
}

function teamTokens(fileNames: string[]): Set<string> {
  const tokens = new Set<string>()
  for (const name of fileNames) {
    for (const regex of [TEAM_TOKEN_RE, TEAM_WORD_RE]) {
      for (const match of name.matchAll(regex)) {
        tokens.add(String(Number(match[1])))
      }
    }
  }
  return tokens
}

interface Cluster {
  members: Set<string>
  appearances: Map<string, number>
  matchIds: string[]
  tokensPerMatch: Set<string>[]
}

export function detectTeams(lineups: Lineup[]): DetectedTeam[] {
  const clusters: Cluster[] = []

  for (const lineup of lineups) {
    const existing = clusters.find((c) => shared(c.members, lineup.puuids) >= SHARED_THRESHOLD)
    const cluster =
      existing ??
      (clusters.push({
        members: new Set(),
        appearances: new Map(),
        matchIds: [],
        tokensPerMatch: [],
      }),
      clusters[clusters.length - 1])

    for (const puuid of lineup.puuids) {
      cluster.members.add(puuid)
      cluster.appearances.set(puuid, (cluster.appearances.get(puuid) ?? 0) + 1)
    }
    cluster.matchIds.push(lineup.matchId)

    const tokens = teamTokens(lineup.fileNames)
    if (tokens.size > 0) cluster.tokensPerMatch.push(tokens)
  }

  return clusters
    .map((cluster) => ({
      puuids: [...cluster.members].sort(
        (a, b) => (cluster.appearances.get(b) ?? 0) - (cluster.appearances.get(a) ?? 0),
      ),
      lineups: cluster.matchIds.length,
      matchIds: cluster.matchIds,
      suggestedName: suggestName(cluster.tokensPerMatch),
      appearances: Object.fromEntries(cluster.appearances),
    }))
    .sort((a, b) => b.lineups - a.lineups)
}

/**
 * A team's own number is the one that survives intersecting the tokens of all
 * its matches: the opponent's changes every time.
 */
function suggestName(tokensPerMatch: Set<string>[]): string | null {
  if (tokensPerMatch.length === 0) return null

  let common = new Set(tokensPerMatch[0])
  for (const tokens of tokensPerMatch.slice(1)) {
    common = new Set([...common].filter((token) => tokens.has(token)))
  }

  return common.size === 1 ? `Equipo ${[...common][0]}` : null
}
