/**
 * Detección de equipos a partir de quiénes juegan juntos.
 *
 * Con 82 jugadores detectados y 29 partidas, asignar a mano es inviable. Los
 * equipos se deducen solos: los 5 de un lado de una partida son un equipo, y
 * dos alineaciones que comparten 3 o más jugadores son el mismo equipo (el
 * umbral tolera suplentes sin fusionar equipos distintos).
 *
 * El nombre sale del nombre de archivo: los equipos escriben "E1vsE4", así que
 * el número que aparece en TODAS las partidas de un grupo es el suyo, y el que
 * varía es el del rival.
 */

export interface Lineup {
  matchId: string
  side: 100 | 200
  puuids: string[]
  /** Nombres de los .rofl de esa partida, de donde sale el nombre del equipo. */
  fileNames: string[]
}

export interface DetectedTeam {
  /** Todos los jugadores vistos en el equipo, del más frecuente al menos. */
  puuids: string[]
  /** Cuántas alineaciones se fusionaron acá. */
  lineups: number
  matchIds: string[]
  suggestedName: string | null
  /** Cuántas partidas jugó cada jugador con este equipo. */
  appearances: Record<string, number>
}

/** Dos alineaciones son el mismo equipo si comparten al menos esta cantidad. */
const SHARED_THRESHOLD = 3

/**
 * "E1vsE4", "WINNERS(E2vsE11)", "E8vsE15-LEIF8". No sirve un \b después del
 * número porque en "E1vsE4" no hay separación entre el 1 y la v; se pide que lo
 * que siga sea "vs" o algo que no sea alfanumérico. La E tiene que estar al
 * principio o después de un separador, así "LEIF8" no cuenta.
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
 * El número propio del equipo es el que sobrevive a intersectar los tokens de
 * todas sus partidas: el del rival cambia en cada una.
 */
function suggestName(tokensPerMatch: Set<string>[]): string | null {
  if (tokensPerMatch.length === 0) return null

  let common = new Set(tokensPerMatch[0])
  for (const tokens of tokensPerMatch.slice(1)) {
    common = new Set([...common].filter((token) => tokens.has(token)))
  }

  return common.size === 1 ? `Equipo ${[...common][0]}` : null
}
