import { cache } from 'react'

/**
 * Riot assets and names (Data Dragon).
 *
 * The assets are served through /api/ddragon/... and not straight from the CDN:
 * same-origin avoids CORS trouble and lets the Instagram card be exported to
 * PNG with html-to-image without tainting the canvas. The data (versions,
 * spells, champion names) is fetched directly, since no canvas is involved
 * there.
 *
 * The `es_AR` locale in the URLs is deliberate: the names shown on the site are
 * the Spanish ones.
 */

const DDRAGON = 'https://ddragon.leagueoflegends.com'
const DAY = 60 * 60 * 24

/**
 * Which patch the assets hang off when ddragon does not answer.
 *
 * Worth keeping roughly up to date: on an old version, champions released after
 * it have no icon. It is still the worst case of the worst case - the version
 * listing itself has to go down - and being one patch behind does not show.
 */
const FALLBACK_VERSION = '16.17.1'

/**
 * The .rofl writes the champion's internal name, which nearly always matches
 * the ddragon key. The exceptions go here.
 *
 * It is only needed to build the icon URL, which is a CDN path and is
 * case-sensitive. Display names are looked up case-insensitively (see
 * `championNames`), so that side does not need the list.
 */
const CHAMPION_ALIASES: Record<string, string> = {
  FiddleSticks: 'Fiddlesticks',
}

export function championKey(champion: string): string {
  return CHAMPION_ALIASES[champion] ?? champion
}

/**
 * The way back: from the ddragon key to the spelling the .rofl writes.
 *
 * It is needed when bans are entered by hand. The champion is picked from a
 * list that comes from ddragon, but what gets stored has to be the .rofl
 * spelling: `champion_meta` joins picks and bans on exact text equality, so a
 * banned "Fiddlesticks" and a played "FiddleSticks" would be two different
 * champions, each with half the numbers.
 *
 * It derives from the same object as `championKey` so the list of exceptions
 * keeps living in one place.
 */
export function roflKey(ddragonId: string): string {
  const entry = Object.entries(CHAMPION_ALIASES).find(([, alias]) => alias === ddragonId)
  return entry?.[0] ?? ddragonId
}

/**
 * A GET to ddragon that degrades instead of throwing.
 *
 * Nothing requested here is essential: with no version there is a fallback,
 * with no names the internal key is shown, and with no icon the grey gap of
 * `GameIcon` is left. Having a Riot outage take down a whole page would be a
 * good deal worse than that.
 *
 * The retry is about the cache and not about the network: Next also stores the
 * failed response for the whole revalidation window, so a two-second blip would
 * leave the site degraded for 24 hours. A retry with no cache only costs one
 * request while ddragon is down, and makes it recover on its own.
 */
async function get<T>(path: string, what: string): Promise<T | null> {
  for (const init of [{ next: { revalidate: DAY } }, { cache: 'no-store' as const }]) {
    try {
      const res = await fetch(`${DDRAGON}/${path}`, init)
      if (!res.ok) continue
      return (await res.json()) as T
    } catch {
      // Network error or broken JSON: handled the same way.
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
 * Asset version for a given patch ("16.12" -> "16.12.1"). When the patch does
 * not exist in ddragon (or is unknown), the latest available one is used: icons
 * change little and showing something beats showing a gap.
 */
export const assetVersion = cache(async (patch: string | null): Promise<string> => {
  const all = await versions()
  if (all.length === 0) return FALLBACK_VERSION
  if (!patch) return all[0]
  return all.find((v) => v.startsWith(`${patch}.`)) ?? all[0]
})

/** Spells arrive as a numeric id ("4"); ddragon names them ("SummonerFlash"). */
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
 * What each champion is called, indexed by its internal key in lower case.
 *
 * The .rofl does not store the champion's name but the internal one, which is a
 * different thing: "MonkeyKing" is Wukong, "Kaisa" is Kai'Sa, "XinZhao" is Xin
 * Zhao and "Nunu" is Nunu y Willump. It works as a key - it is what the
 * database stores - but showing it to somebody is showing them a variable name.
 * The real name, in Spanish on top of that, only lives here.
 *
 * The key is lower-cased so that casing differences between the .rofl and
 * ddragon ("FiddleSticks" against "Fiddlesticks") cannot leave a champion
 * nameless.
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
 * The whole catalogue, with the key exactly as ddragon writes it.
 *
 * `championNames` indexes in lower case and loses the original casing doing so,
 * which is precisely what it takes to build an icon URL and to store a ban.
 * This returns both ends - key and name - sorted by name, which is how a
 * dropdown of 170 champions gets read.
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
 * A champion's display name.
 *
 * If ddragon did not answer, or the champion is so new it is not in the patch
 * that was queried yet, the internal key is left: it reads worse than "Wukong"
 * but it is understandable, which is more than can be said for an empty space.
 */
export function championName(names: Record<string, string>, champion: string): string {
  return names[champion.toLowerCase()] ?? champion
}

export function championIcon(version: string, champion: string): string {
  return `/api/ddragon/cdn/${version}/img/champion/${championKey(champion)}.png`
}

export function itemIcon(version: string, itemId: number): string | null {
  return itemId > 0 ? `/api/ddragon/cdn/${version}/img/item/${itemId}.png` : null
}

export function spellIcon(version: string, spellName: string | undefined): string | null {
  return spellName ? `/api/ddragon/cdn/${version}/img/spell/${spellName}.png` : null
}
