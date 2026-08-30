import { cache } from 'react'

/**
 * Assets y nombres de Riot (Data Dragon).
 *
 * Los assets se sirven por /api/ddragon/... y no directo desde el CDN:
 * same-origin evita problemas de CORS y deja que la card de Instagram se
 * exporte a PNG con html-to-image sin ensuciar el canvas. Los datos (versiones,
 * hechizos, nombres de campeones) sí se piden directo, que para eso no hay
 * canvas de por medio.
 */

const DDRAGON = 'https://ddragon.leagueoflegends.com'
const DAY = 60 * 60 * 24

/**
 * De qué parche se cuelgan los assets si ddragon no contesta.
 *
 * Conviene tenerla más o menos al día: con una versión vieja los campeones
 * salidos después no tienen ícono. Igual es el peor caso del peor caso —hace
 * falta que se caiga el listado de versiones— y un parche corrido no se nota.
 */
const FALLBACK_VERSION = '16.17.1'

/**
 * El .rofl escribe el nombre interno del campeón, que casi siempre coincide con
 * la clave de ddragon. Las excepciones van acá.
 *
 * Sólo hace falta para armar la URL del ícono, que es una ruta de CDN y
 * distingue mayúsculas. Los nombres para mostrar se buscan sin distinguirlas
 * (ver `championNames`), así que ese lado no necesita la lista.
 */
const CHAMPION_ALIASES: Record<string, string> = {
  FiddleSticks: 'Fiddlesticks',
}

export function championKey(champion: string): string {
  return CHAMPION_ALIASES[champion] ?? champion
}

/**
 * Un GET a ddragon que degrada en vez de tirar.
 *
 * Nada de lo que se pide acá es imprescindible: sin versión hay una de
 * respaldo, sin nombres se muestra la clave interna y sin ícono queda el hueco
 * gris de `GameIcon`. Que una caída de Riot voltee una página entera sería
 * bastante peor que eso.
 *
 * El reintento es por la caché y no por la red: Next guarda también la
 * respuesta fallida durante toda la ventana de revalidación, así que un
 * parpadeo de dos segundos dejaría el sitio degradado por 24 horas. Un
 * reintento sin caché sólo cuesta un pedido mientras ddragon esté caído, y hace
 * que se recupere solo.
 */
async function get<T>(path: string, what: string): Promise<T | null> {
  for (const init of [{ next: { revalidate: DAY } }, { cache: 'no-store' as const }]) {
    try {
      const res = await fetch(`${DDRAGON}/${path}`, init)
      if (!res.ok) continue
      return (await res.json()) as T
    } catch {
      // Error de red o JSON roto: se maneja igual.
    }
  }

  console.error(`ddragon: no se pudo cargar ${what} (${path}).`)
  return null
}

/** Versiones de ddragon, de la más nueva a la más vieja. */
const versions = cache(async (): Promise<string[]> => {
  return (await get<string[]>('api/versions.json', 'el listado de versiones')) ?? []
})

/**
 * Versión de assets para un parche dado ("16.12" -> "16.12.1"). Si el parche no
 * existe en ddragon (o no se conoce), se usa la última disponible: los íconos
 * cambian poco y es mejor mostrar algo que un hueco.
 */
export const assetVersion = cache(async (patch: string | null): Promise<string> => {
  const all = await versions()
  if (all.length === 0) return FALLBACK_VERSION
  if (!patch) return all[0]
  return all.find((v) => v.startsWith(`${patch}.`)) ?? all[0]
})

/** Los hechizos vienen como id numérico ("4"); ddragon los nombra ("SummonerFlash"). */
export const summonerSpellNames = cache(async (version: string): Promise<Record<string, string>> => {
  const json = await get<{ data: Record<string, { key: string; id: string }> }>(
    `cdn/${version}/data/es_AR/summoner.json`,
    'los hechizos de invocador',
  )

  const byKey: Record<string, string> = {}
  for (const spell of Object.values(json?.data ?? {})) byKey[spell.key] = spell.id
  return byKey
})

/**
 * Cómo se llama cada campeón, indexado por su clave interna en minúsculas.
 *
 * El .rofl no guarda el nombre del campeón sino el interno, que es otra cosa:
 * "MonkeyKing" es Wukong, "Kaisa" es Kai'Sa, "XinZhao" es Xin Zhao y "Nunu" es
 * Nunu y Willump. Sirve como clave —es lo que se guarda en la base— pero
 * mostrárselo a alguien es mostrarle el nombre de una variable. El nombre de
 * verdad, y encima en castellano, sólo vive acá.
 *
 * La clave va en minúsculas para que las diferencias de mayúsculas entre el
 * .rofl y ddragon ("FiddleSticks" contra "Fiddlesticks") no dejen a un campeón
 * sin nombre.
 */
export const championNames = cache(async (version: string): Promise<Record<string, string>> => {
  const json = await get<{ data: Record<string, { id: string; name: string }> }>(
    `cdn/${version}/data/es_AR/champion.json`,
    'los nombres de los campeones',
  )

  const byKey: Record<string, string> = {}
  for (const champ of Object.values(json?.data ?? {})) byKey[champ.id.toLowerCase()] = champ.name
  return byKey
})

/**
 * El nombre para mostrar de un campeón.
 *
 * Si ddragon no contestó, o si el campeón es tan nuevo que todavía no está en
 * el parche que se consultó, queda la clave interna: se lee peor que "Wukong"
 * pero se entiende, que es más de lo que se puede decir de un espacio vacío.
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
