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

/**
 * Los cinco roles, en orden de línea. Es el orden en que se lee un plantel y en
 * el que se dibuja un scoreboard.
 *
 * El soporte es `SUPPORT`. El .rofl lo llama `UTILITY`, pero eso se normaliza al
 * entrar (`normalizePosition` en el parser, y un trigger en la base por si algo
 * escribe sin pasar por ahí): del lado de acá hay un solo nombre.
 */
export const ROLES = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'SUPPORT'] as const

/** El .rofl trae la posición en inglés; la UI la muestra en castellano. */
const POSITIONS: Record<string, string> = {
  TOP: 'Top',
  JUNGLE: 'Jungla',
  MIDDLE: 'Mid',
  BOTTOM: 'ADC',
  SUPPORT: 'Soporte',
  // Por si quedara alguna fila vieja sin normalizar: es el mismo rol, no otro.
  UTILITY: 'Soporte',
}

export function formatPosition(position: string | null): string {
  if (!position) return '—'
  return POSITIONS[position] ?? position
}

/**
 * Cómo se nombra a un jugador en el sitio: el alias que haya cargado el panel,
 * o su nombre de Riot **sin el `#TAG`**.
 *
 * Sin el tag porque es el nombre grande, el que se lee de un vistazo: el tag va
 * al lado, en chico, y de eso se encarga `riotTag`.
 */
export function playerName(gameName: string | null, displayName?: string | null): string {
  return displayName ?? gameName ?? 'Desconocido'
}

/**
 * El Riot ID completo, con `#TAG`.
 *
 * Es lo que hace falta para distinguir dos cuentas, porque el nombre solo puede
 * repetirse y el Riot ID entero no: por eso el panel lo usa para emparejar una
 * cuenta con un inscripto, y `riotTag` para mostrarlo en las páginas públicas.
 */
export function riotId(gameName: string | null, tagLine: string | null): string {
  if (!gameName) return 'Desconocido'
  return tagLine ? `${gameName}#${tagLine}` : gameName
}

/**
 * El `#TAG` que se dibuja apagado al lado del nombre, para terminar de decir de
 * qué cuenta se trata. Se ve siempre: sin sesión también, porque los que más
 * miran el plantel son los propios jugadores y ninguno tiene usuario.
 *
 * Cuando el nombre grande es un alias del panel, el tag solo no alcanza —el
 * alias no es el nick al que se le pega— y devuelve el Riot ID entero. Da null
 * cuando no hay nada que agregar: una cuenta sin tag, de un .rofl viejo.
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
