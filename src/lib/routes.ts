/**
 * Every site route, built in one place.
 *
 * Links to a player's page come from seven different spots — a team's lineup,
 * the scoreboard, a match detail, two stats tables, two rankings — and as long
 * as each one spells the URL out by hand, moving that page means finding them
 * all.
 *
 * ABOUT THE ID THAT TRAVELS IN THE URL: it is `players.id`, an internal uuid
 * that means nothing outside. It is NOT the `puuid`, which is the Riot
 * identifier you can ask their API about that person with: that one never
 * leaves the server — no public view exposes it, see 0013_publico.sql — and
 * that is why the page is looked up through `player_profiles` and not
 * `players`.
 *
 * The URL segments stay in Spanish on purpose: they are what a visitor sees
 * and shares.
 */

export function playerPath(playerId: string): string {
  return `/jugadores/${playerId}`
}

/**
 * WHERE THE BACK ARROW GOES BACK TO.
 *
 * A team's page is not reached from one place: it is reached from the front
 * page - from the group tables and from the highlight notice -, from the list
 * at /equipos, from the tables at /estadisticas/tablas and from a player's
 * page. The arrow at the top said "← Equipos" to all of them, so whoever came
 * from the front page and pressed it ended up in a list they had never seen,
 * with the fixture they were reading four scrolls up and no way back to the
 * exact spot.
 *
 * So the link that leads to the team says where it is leading FROM, in a
 * `desde` that travels in the URL. It is a key and not a path on purpose: the
 * value is read straight off a URL that anybody can type, and a key that is
 * looked up in this table can only ever come out as one of these three
 * destinations. A path taken as given is an open door to sending the visitor
 * wherever the person who wrote the link wanted.
 *
 * The keys stay in Spanish because they end up in shared links, like `fecha`
 * and `grupo`.
 */
export const ORIGINS = {
  portada: { href: '/', label: 'Portada' },
  // The group tables are four scrolls down the front page, so this one leads
  // back to the section and not to the top of it: coming back to the header of
  // a page you were reading the middle of is barely better than not coming
  // back at all. The anchor is the `id` the section already carries.
  grupos: { href: '/#grupos', label: 'Portada' },
  equipos: { href: '/equipos', label: 'Equipos' },
  tablas: { href: '/estadisticas/tablas', label: 'Tablas' },
} as const

export type Origin = keyof typeof ORIGINS

/**
 * The one origin that cannot be a fixed entry in the table: a match.
 *
 * Every team on a scoreboard leads to its page, and "back" from there is that
 * match and not the listing of all of them - the listing is another sixty rows
 * to find again the one that was open. So this key carries which one, after
 * the dot: `desde=partida.<uuid>`.
 *
 * The uuid is checked before being used. It is the only part of a `desde` that
 * is not a closed key, so it is the only one that could turn into a path
 * written by whoever wrote the link, and the check is what keeps it to the
 * shape of an id.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Whether something that arrived in a URL has the shape of one of our ids.
 *
 * For whoever is about to paste it into a query built by hand - PostgREST's
 * `or()` takes a raw filter expression, and an id from the path is written by
 * whoever typed the URL.
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
 * Resolves the `desde` of a URL, falling back when it says nothing usable.
 *
 * Anything that is not one of the keys - an old link, a typo, a repeated
 * parameter that arrives as an array, a `partida.` with something that is not
 * an id behind it - lands on the fallback, which is the page the arrow pointed
 * at before any of this existed.
 */
export function originFrom(
  value: string | string[] | undefined,
  fallback: Origin,
): { href: string; label: string } {
  if (typeof value === 'string') {
    if (value in ORIGINS) return ORIGINS[value as Origin]

    const id = value.startsWith('partida.') ? value.slice('partida.'.length) : null
    if (id && UUID.test(id)) return { href: matchPath(id), label: 'Partida' }
  }

  return ORIGINS[fallback]
}

export function matchPath(matchId: string): string {
  return `/partidas/${matchId}`
}
