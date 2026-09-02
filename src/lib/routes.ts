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

export function teamPath(teamId: string): string {
  return `/equipos/${teamId}`
}

export function matchPath(matchId: string): string {
  return `/partidas/${matchId}`
}
