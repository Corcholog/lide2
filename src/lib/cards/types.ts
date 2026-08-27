/**
 * Las piezas para redes.
 *
 * Una pieza no es más que un `StatBlock` —lo mismo que dibuja una tarjeta de
 * /estadisticas— con un encabezado que dice de qué recorte salió. Esa es toda
 * la idea: el catálogo de estadísticas ya sabe calcular y titular, así que las
 * cards no vuelven a decidir nada, sólo eligen cuáles se publican y las dibujan
 * a 1080 de ancho.
 *
 * Consecuencia práctica: sumar una estadística al registro la deja disponible
 * como card sin tocar nada de acá.
 */

import type { StatBlock } from '@/lib/stats/types'

export type PosterFormat = 'post' | 'story'

export interface FormatSpec {
  id: PosterFormat
  label: string
  width: number
  height: number
}

/**
 * Los dos formatos de Instagram.
 *
 * 4:5 es el vertical más alto que el feed no recorta, y 9:16 es la historia
 * completa. Los dos a 1080 de ancho, que es lo que Instagram sirve sin volver a
 * comprimir.
 */
export const FORMATS: FormatSpec[] = [
  { id: 'post', label: 'Post 1080 × 1350', width: 1080, height: 1350 },
  { id: 'story', label: 'Historia 1080 × 1920', width: 1080, height: 1920 },
]

export interface Poster {
  id: string
  block: StatBlock
  /** El renglón chico de arriba: "Fecha 2 · Fase de grupos". */
  kicker: string
  /**
   * Si las filas son un ranking.
   *
   * Casi siempre sí, y entonces van numeradas y el primero se destaca. "Los
   * números" no lo es: son cinco cifras distintas —partidas, kills, la más
   * larga— y ponerles 1, 2, 3 al lado afirmaría un orden que no existe.
   */
  ordered: boolean
}
