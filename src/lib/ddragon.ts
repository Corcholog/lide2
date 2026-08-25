import { cache } from 'react'

/**
 * Assets de Riot (Data Dragon).
 *
 * Todo se sirve por /api/ddragon/... y no directo desde el CDN: same-origin
 * evita problemas de CORS y deja que la card de Instagram se exporte a PNG con
 * html-to-image sin ensuciar el canvas.
 */

const DDRAGON = 'https://ddragon.leagueoflegends.com'
const DAY = 60 * 60 * 24

/**
 * El .rofl escribe el nombre interno del campeón, que casi siempre coincide con
 * la clave de ddragon. Las excepciones van acá.
 */
const CHAMPION_ALIASES: Record<string, string> = {
  FiddleSticks: 'Fiddlesticks',
}

export function championKey(champion: string): string {
  return CHAMPION_ALIASES[champion] ?? champion
}

/** Versiones de ddragon, de la más nueva a la más vieja. */
const versions = cache(async (): Promise<string[]> => {
  try {
    const res = await fetch(`${DDRAGON}/api/versions.json`, { next: { revalidate: DAY } })
    if (!res.ok) return []
    return (await res.json()) as string[]
  } catch {
    return []
  }
})

/**
 * Versión de assets para un parche dado ("16.12" -> "16.12.1"). Si el parche no
 * existe en ddragon (o no se conoce), se usa la última disponible: los íconos
 * cambian poco y es mejor mostrar algo que un hueco.
 */
export const assetVersion = cache(async (patch: string | null): Promise<string> => {
  const all = await versions()
  if (all.length === 0) return '15.1.1'
  if (!patch) return all[0]
  return all.find((v) => v.startsWith(`${patch}.`)) ?? all[0]
})

/** Los hechizos vienen como id numérico ("4"); ddragon los nombra ("SummonerFlash"). */
export const summonerSpellNames = cache(async (version: string): Promise<Record<string, string>> => {
  try {
    const res = await fetch(`${DDRAGON}/cdn/${version}/data/es_AR/summoner.json`, {
      next: { revalidate: DAY },
    })
    if (!res.ok) return {}

    const json = (await res.json()) as { data: Record<string, { key: string; id: string }> }
    const byKey: Record<string, string> = {}
    for (const spell of Object.values(json.data)) byKey[spell.key] = spell.id
    return byKey
  } catch {
    return {}
  }
})

export function championIcon(version: string, champion: string): string {
  return `/api/ddragon/cdn/${version}/img/champion/${championKey(champion)}.png`
}

export function itemIcon(version: string, itemId: number): string | null {
  return itemId > 0 ? `/api/ddragon/cdn/${version}/img/item/${itemId}.png` : null
}

export function spellIcon(version: string, spellName: string | undefined): string | null {
  return spellName ? `/api/ddragon/cdn/${version}/img/spell/${spellName}.png` : null
}
