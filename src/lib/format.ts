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

export function riotId(gameName: string | null, tagLine: string | null): string {
  if (!gameName) return 'Desconocido'
  return tagLine ? `${gameName}#${tagLine}` : gameName
}
