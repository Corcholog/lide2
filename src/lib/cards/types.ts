/**
 * The pieces for social media.
 *
 * A piece is no more than a `StatBlock` - the same thing a card on
 * /estadisticas draws - with a header saying which scope it came from. That is
 * the whole idea: the stats catalogue already knows how to compute and title,
 * so the cards decide nothing again, they only pick which ones get published
 * and draw them 1080 wide.
 *
 * The practical consequence: adding a stat to the registry makes it available
 * as a card without touching anything here.
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
 * The two Instagram formats.
 *
 * 4:5 is the tallest vertical the feed does not crop, and 9:16 is the full
 * story. Both 1080 wide, which is what Instagram serves without recompressing.
 */
export const FORMATS: FormatSpec[] = [
  { id: 'post', label: 'Post 1080 × 1350', width: 1080, height: 1350 },
  { id: 'story', label: 'Historia 1080 × 1920', width: 1080, height: 1920 },
]

export interface Poster {
  id: string
  block: StatBlock
  /** The small line at the top: "Fecha 2 · Fase de grupos". */
  kicker: string
  /**
   * Whether the rows are a ranking.
   *
   * Nearly always yes, and then they are numbered and the first one stands out.
   * "Los números" is not: it is five different figures - matches, kills, the
   * longest one - and putting 1, 2, 3 beside them would assert an order that
   * does not exist.
   */
  ordered: boolean
}
