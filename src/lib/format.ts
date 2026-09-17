/** Formatting helpers shared across the site. Output is Spanish. */

export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export function formatGold(gold: number): string {
  return `${(gold / 1000).toFixed(1)}k`
}

/** A ratio as a whole percentage: 0.567 -> "57%". */
export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`
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
 * K/D/A per game: "4/1/13.5". Whole numbers print without a decimal to save
 * space. Values are rounded first, so 5.999999 prints as "6".
 */
export function formatKdaAverage(kills: number, deaths: number, assists: number): string {
  return [kills, deaths, assists].map(oneDecimal).join('/')
}

function oneDecimal(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

/**
 * The five roles in lane order, the order lineups and scoreboards use.
 *
 * The .rofl calls support `UTILITY`; it is normalized to `SUPPORT` on ingest
 * (`normalizePosition` in the parser, plus a database trigger), so only
 * `SUPPORT` appears here.
 */
export const ROLES = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'SUPPORT'] as const

/** Position names as shown in the UI. */
const POSITIONS: Record<string, string> = {
  TOP: 'Top',
  JUNGLE: 'Jungla',
  MIDDLE: 'Mid',
  BOTTOM: 'ADC',
  SUPPORT: 'Soporte',
  // Rows written before normalization existed.
  UTILITY: 'Soporte',
}

export function formatPosition(position: string | null): string {
  if (!position) return '—'
  return POSITIONS[position] ?? position
}

/**
 * Every role a champion was played in: the main role first, the rest in lane
 * order (the views return them unordered).
 *
 * `main` may be missing from `positions`, and unknown roles are kept rather
 * than dropped so unexpected data stays visible.
 */
export function championRoles(positions: string[], main: string | null): string[] {
  const rest = positions.filter((role) => role !== main)
  rest.sort((a, b) => {
    const lane = (role: string) => {
      const index = ROLES.indexOf(role as (typeof ROLES)[number])
      return index === -1 ? ROLES.length : index
    }
    return lane(a) - lane(b) || a.localeCompare(b)
  })

  return main ? [main, ...rest] : rest
}

/** The same roles as display text: "Top, Soporte". */
export function formatRoles(positions: string[], main: string | null): string {
  const roles = championRoles(positions, main)
  return roles.length === 0 ? formatPosition(main) : roles.map(formatPosition).join(', ')
}

/**
 * A player's display name: the alias set in the admin panel, or the Riot name
 * without the `#TAG` (see `riotTag` for the tag).
 */
export function playerName(gameName: string | null, displayName?: string | null): string {
  return displayName ?? gameName ?? 'Desconocido'
}

/**
 * The full Riot ID with `#TAG`. Names can repeat but full Riot IDs cannot, so
 * this is what tells accounts apart.
 */
export function riotId(gameName: string | null, tagLine: string | null): string {
  if (!gameName) return 'Desconocido'
  return tagLine ? `${gameName}#${tagLine}` : gameName
}

/**
 * The `#TAG` shown dimmed next to a player's name, visible to everyone.
 *
 * When the displayed name is an alias, the full Riot ID is returned instead,
 * since the tag alone would not identify the account. Null when there is
 * nothing to add (accounts without a tag, from old replays).
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
 * Splits "Name#TAG" into its parts, on the last `#` (names may contain spaces,
 * tags may not). Without a `#`, only the name is returned: signup sheets may
 * omit tags.
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
