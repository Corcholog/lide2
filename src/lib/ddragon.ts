import { cache } from 'react'

/**
 * Riot's Data Dragon: champion, item and spell images and names.
 *
 * Images go through the same-origin proxy at /api/ddragon/... so cards can be
 * exported to PNG with html-to-image without tainting the canvas. JSON data is
 * fetched directly. Names use the `es_AR` locale.
 */

const DDRAGON = 'https://ddragon.leagueoflegends.com'
const DAY = 60 * 60 * 24

/**
 * Version used when ddragon's version list cannot be loaded. Bump it now and
 * then: champions released after this version have no icon.
 */
const FALLBACK_VERSION = '16.17.1'

/**
 * Champions whose .rofl name differs from the ddragon key in case. Only icon
 * URLs need this (CDN paths are case-sensitive); name lookups are
 * case-insensitive.
 */
const CHAMPION_ALIASES: Record<string, string> = {
  FiddleSticks: 'Fiddlesticks',
}

export function championKey(champion: string): string {
  return CHAMPION_ALIASES[champion] ?? champion
}

/**
 * The reverse of `championKey`: ddragon key to .rofl spelling.
 *
 * Needed for bans entered by hand: `champion_meta` joins picks and bans by
 * exact text, so bans must be stored with the .rofl spelling.
 */
export function roflKey(ddragonId: string): string {
  const entry = Object.entries(CHAMPION_ALIASES).find(([, alias]) => alias === ddragonId)
  return entry?.[0] ?? ddragonId
}

/**
 * GET from ddragon that returns null instead of throwing. Nothing fetched here
 * is essential, so a Riot outage should not break a page.
 *
 * The second attempt skips the cache: Next caches failed responses for the
 * whole revalidation window, which would keep the site degraded for a day.
 */
async function get<T>(path: string, what: string): Promise<T | null> {
  for (const init of [{ next: { revalidate: DAY } }, { cache: 'no-store' as const }]) {
    try {
      const res = await fetch(`${DDRAGON}/${path}`, init)
      if (!res.ok) continue
      return (await res.json()) as T
    } catch {
      // Network error or invalid JSON.
    }
  }

  console.error(`ddragon: could not load ${what} (${path}).`)
  return null
}

/** ddragon versions, newest first. */
const versions = cache(async (): Promise<string[]> => {
  return (await get<string[]>('api/versions.json', 'the version listing')) ?? []
})

/**
 * The ddragon version for a patch ("16.12" -> "16.12.1"). Falls back to the
 * latest version when the patch is unknown or missing.
 */
export const assetVersion = cache(async (patch: string | null): Promise<string> => {
  const all = await versions()
  if (all.length === 0) return FALLBACK_VERSION
  if (!patch) return all[0]
  return all.find((v) => v.startsWith(`${patch}.`)) ?? all[0]
})

/** Spell ids ("4") mapped to ddragon names ("SummonerFlash"). */
export const summonerSpellNames = cache(async (version: string): Promise<Record<string, string>> => {
  const json = await get<{ data: Record<string, { key: string; id: string }> }>(
    `cdn/${version}/data/es_AR/summoner.json`,
    'the summoner spells',
  )

  const byKey: Record<string, string> = {}
  for (const spell of Object.values(json?.data ?? {})) byKey[spell.key] = spell.id
  return byKey
})

/**
 * Champion display names in Spanish, keyed by lower-case internal name.
 *
 * The .rofl and the database store internal names ("MonkeyKing" for Wukong,
 * "Kaisa" for Kai'Sa). Keys are lower-cased because casing differs between
 * the .rofl and ddragon ("FiddleSticks" vs "Fiddlesticks").
 */
export const championNames = cache(async (version: string): Promise<Record<string, string>> => {
  const json = await get<{ data: Record<string, { id: string; name: string }> }>(
    `cdn/${version}/data/es_AR/champion.json`,
    'the champion names',
  )

  const byKey: Record<string, string> = {}
  for (const champ of Object.values(json?.data ?? {})) byKey[champ.id.toLowerCase()] = champ.name
  return byKey
})

/**
 * Every champion with its ddragon key (original casing, needed for icon URLs
 * and stored bans) and name, sorted by name for dropdowns.
 */
export const championCatalog = cache(
  async (version: string): Promise<{ key: string; name: string }[]> => {
    const json = await get<{ data: Record<string, { id: string; name: string }> }>(
      `cdn/${version}/data/es_AR/champion.json`,
      'the champion catalogue',
    )

    return Object.values(json?.data ?? {})
      .map((champ) => ({ key: champ.id, name: champ.name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'))
  },
)

/**
 * A champion's display name, or the internal key when ddragon did not respond
 * or does not know the champion yet.
 */
export function championName(names: Record<string, string>, champion: string): string {
  return names[champion.toLowerCase()] ?? champion
}

export function championIcon(version: string, champion: string): string {
  return `/api/ddragon/cdn/${version}/img/champion/${championKey(champion)}.png`
}

/**
 * The champion's loading screen art (308 x 560). The path has no version.
 * Always the base skin: the .rofl does not record which skin was used.
 */
export function championLoading(champion: string, skin = 0): string {
  return `/api/ddragon/cdn/img/champion/loading/${championKey(champion)}_${skin}.jpg`
}

export function itemIcon(version: string, itemId: number): string | null {
  return itemId > 0 ? `/api/ddragon/cdn/${version}/img/item/${itemId}.png` : null
}

export function spellIcon(version: string, spellName: string | undefined): string | null {
  return spellName ? `/api/ddragon/cdn/${version}/img/spell/${spellName}.png` : null
}
