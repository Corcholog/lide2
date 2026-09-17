/**
 * Pieces for social media. A piece is a `StatBlock` (what a card on
 * /estadisticas draws) plus a header naming its scope, so any stat in the
 * registry can be published without changes here.
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
 * The two Instagram formats, both 1080 wide: 4:5 for the feed (the tallest it
 * does not crop) and 9:16 for stories.
 */
export const FORMATS: FormatSpec[] = [
  { id: 'post', label: 'Post 1080 × 1350', width: 1080, height: 1350 },
  { id: 'story', label: 'Historia 1080 × 1920', width: 1080, height: 1920 },
]

export interface Poster {
  id: string
  block: StatBlock
  /** The line at the top: "Fecha 2 · Fase de grupos". */
  kicker: string
  /**
   * Whether the rows are a ranking (numbered, first one highlighted). False for
   * "Los números", which lists unrelated figures.
   */
  ordered: boolean
}
