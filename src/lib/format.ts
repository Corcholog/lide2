/** Formateo compartido por el listado, el detalle y las cards. */

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

/** El .rofl trae la posición en inglés; la UI la muestra en castellano. */
const POSITIONS: Record<string, string> = {
  TOP: 'Top',
  JUNGLE: 'Jungla',
  MIDDLE: 'Mid',
  BOTTOM: 'ADC',
  UTILITY: 'Support',
}

export function formatPosition(position: string | null): string {
  if (!position) return '—'
  return POSITIONS[position] ?? position
}

/**
 * Cómo se nombra a un jugador en el sitio: el alias que haya cargado el panel,
 * o su nombre de Riot **sin el `#TAG`**.
 *
 * Sin el tag a propósito. El tag no aporta nada para reconocer a alguien —lo
 * que se ve en la partida es el nombre— y este es el nombre que sale en páginas
 * públicas, así que la versión segura tiene que ser la que se escribe sin
 * pensar. Para el `#TAG` está `riotId`, que se usa sólo en el panel.
 */
export function playerName(gameName: string | null, displayName?: string | null): string {
  return displayName ?? gameName ?? 'Desconocido'
}

/**
 * El Riot ID completo, con `#TAG`.
 *
 * Sólo para el panel: es lo que hace falta para emparejar una cuenta con un
 * inscripto, porque el nombre solo puede repetirse y el Riot ID completo no.
 */
export function riotId(gameName: string | null, tagLine: string | null): string {
  if (!gameName) return 'Desconocido'
  return tagLine ? `${gameName}#${tagLine}` : gameName
}

/**
 * El camino inverso: de "DenisChang#LAN" a sus dos partes.
 *
 * El game name puede tener espacios y el tag no, así que se corta por el
 * **último** `#`. Sin `#` se devuelve sólo el nombre: la planilla puede venir
 * sin tags y eso se banca, aunque empareje peor.
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
