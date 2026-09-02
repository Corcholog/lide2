/** Formatting shared by the match list, the match detail and the cards. */

export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export function formatGold(gold: number): string {
  return `${(gold / 1000).toFixed(1)}k`
}

export function formatNumber(value: number): string {
  return value.toLocaleString('es-AR')
}

export function formatDate(iso: string | null): string {
  if (!iso) return 'sin fecha'
  return new Date(iso).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export function formatKda(kills: number, deaths: number, assists: number): string {
  return `${kills}/${deaths}/${assists}`
}

/**
 * The five roles, in lane order. It is the order a lineup is read in and the
 * one a scoreboard is drawn in.
 *
 * Support is `SUPPORT`. The .rofl calls it `UTILITY`, but that is normalized on
 * the way in (`normalizePosition` in the parser, plus a trigger in the database
 * in case something writes without going through it): on this side there is
 * only ever one name.
 */
export const ROLES = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'SUPPORT'] as const

/** The .rofl gives the position in English; the UI shows it in Spanish. */
const POSITIONS: Record<string, string> = {
  TOP: 'Top',
  JUNGLE: 'Jungla',
  MIDDLE: 'Mid',
  BOTTOM: 'ADC',
  SUPPORT: 'Soporte',
  // In case an old un-normalized row is left over: same role, not another one.
  UTILITY: 'Soporte',
}

export function formatPosition(position: string | null): string {
  if (!position) return '—'
  return POSITIONS[position] ?? position
}

/**
 * How a player is named across the site: the alias the admin panel set, or
 * their Riot name **without the `#TAG`**.
 *
 * Without the tag because this is the big name, the one read at a glance: the
 * tag goes next to it, small, and `riotTag` takes care of that.
 */
export function playerName(gameName: string | null, displayName?: string | null): string {
  return displayName ?? gameName ?? 'Desconocido'
}

/**
 * The full Riot ID, with `#TAG`.
 *
 * It is what it takes to tell two accounts apart, because the name on its own
 * can repeat and the whole Riot ID cannot: that is why the admin panel uses it
 * to match an account with a signup, and `riotTag` to show it on public pages.
 */
export function riotId(gameName: string | null, tagLine: string | null): string {
  if (!gameName) return 'Desconocido'
  return tagLine ? `${gameName}#${tagLine}` : gameName
}

/**
 * The `#TAG` drawn dimmed next to the name, to finish saying which account this
 * is. It always shows, signed out too, because the people who look at a lineup
 * most are the players themselves and none of them has an account.
 *
 * When the big name is an alias from the admin panel, the tag alone is not
 * enough — the alias is not the nick it attaches to — and the whole Riot ID is
 * returned instead. It gives null when there is nothing to add: an account with
 * no tag, from an old .rofl.
 */
export function riotTag(
  gameName: string | null,
  tagLine: string | null,
  displayName?: string | null,
): string | null {
  if (displayName && gameName && displayName !== gameName) return riotId(gameName, tagLine)
  return tagLine ? `#${tagLine}` : null
}

/**
 * The way back: from "DenisChang#LAN" to its two parts.
 *
 * The game name may contain spaces and the tag may not, so it splits on the
 * **last** `#`. With no `#` only the name is returned: the signup sheet can
 * arrive without tags and that is tolerated, even if it matches worse.
 */
export function parseRiotId(value: string): { gameName: string; tagLine: string | null } | null {
  const text = value.trim()
  if (!text) return null

  const hash = text.lastIndexOf('#')
  if (hash < 0) return { gameName: text, tagLine: null }

  const gameName = text.slice(0, hash).trim()
  const tagLine = text.slice(hash + 1).trim()

  if (!gameName) return null
  return { gameName, tagLine: tagLine || null }
}
