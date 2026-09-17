/**
 * Every site route, built in one place.
 *
 * Player links use `players.id`, an internal uuid, never the Riot `puuid`: the
 * puuid does not leave the server (no public view exposes it, see
 * 0013_publico.sql), so the page reads `player_profiles` instead of `players`.
 *
 * URL segments stay in Spanish because visitors see and share them.
 */

export function playerPath(playerId: string): string {
  return `/jugadores/${playerId}`
}

/**
 * Where a team page's back arrow leads.
 *
 * A team page is reached from several places, so links to it pass a `desde`
 * key naming where they came from. It is a key looked up in this table, not a
 * path, because the value comes from a URL anyone can edit: a path taken as-is
 * would allow redirecting visitors anywhere. Keys stay in Spanish because they
 * appear in shared links.
 */
export const ORIGINS = {
  portada: { href: '/', label: 'Portada' },
  // Back to the group tables section, not the top of the home page.
  grupos: { href: '/#grupos', label: 'Portada' },
  // Back to the bracket section.
  playoffs: { href: '/#playoffs', label: 'Portada' },
  equipos: { href: '/equipos', label: 'Equipos' },
  // The match listing. Not to be confused with `partida.<uuid>`, which leads
  // back to one match.
  partidas: { href: '/partidas', label: 'Partidas' },
  tablas: { href: '/estadisticas/tablas', label: 'Tablas' },
} as const

export type Origin = keyof typeof ORIGINS

/**
 * The only origin that is not a fixed key: a single match, written as
 * `desde=partida.<uuid>`. The uuid is validated before use so it cannot
 * become an arbitrary path.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Whether a value from a URL has the shape of a uuid. Use it before putting an
 * id into a hand-built query, such as a PostgREST `or()` filter expression.
 */
export function isUuid(value: string): boolean {
  return UUID.test(value)
}

export type MatchOrigin = `partida.${string}`

export function matchOrigin(matchId: string): MatchOrigin {
  return `partida.${matchId}`
}

export function teamPath(teamId: string, from?: Origin | MatchOrigin): string {
  return from ? `/equipos/${teamId}?desde=${from}` : `/equipos/${teamId}`
}

/**
 * Resolves the `desde` parameter. Anything that is not a known key or a valid
 * `partida.<uuid>` (old links, typos, repeated parameters) uses `fallback`.
 */
export function originFrom(
  value: string | string[] | undefined,
  fallback: Origin,
): { href: string; label: string } {
  if (typeof value === 'string') {
    if (value in ORIGINS) return ORIGINS[value as Origin]

    const id = value.startsWith('partida.') ? value.slice('partida.'.length) : null
    if (id && isUuid(id)) return { href: matchPath(id), label: 'Partida' }
  }

  return ORIGINS[fallback]
}

export function matchPath(matchId: string): string {
  return `/partidas/${matchId}`
}
