/**
 * The set of Instagram pieces published for a scope.
 *
 * A curated subset of the registry, and a different one for a single matchday
 * than for the whole phase. The lists are an editorial choice meant to be
 * edited.
 */

import { STATS } from '@/lib/stats/registry'
import type { StatScope, StatsData } from '@/lib/stats/types'
import type { GroupStandingRow } from '@/types/db'
import { groupTables, matchdayNumbers } from './summary'
import type { Poster } from './types'

/**
 * Pieces for a single matchday: best performer, starting five, standout
 * university and meta. Volume rankings are left out, since within one matchday
 * they favour teams that played twice.
 */
export const BY_MATCHDAY = ['mvp', 'quinteto', 'universidad-fecha', 'picks', 'bans']

/**
 * Pieces for the whole phase, where totals are meaningful and records need
 * several matches.
 */
export const ACCUMULATED = [
  'mvp',
  'quinteto',
  'kills',
  'racha',
  'dano',
  'universidades',
  'winrate',
  'picks',
  'bans',
  'mas-larga',
  'mas-kills',
  'mas-pareja',
]

/** "Fecha 2 · Fase de grupos", the line at the top of every piece. */
export function kickerFor(scope: StatScope): string {
  const phase = scope.phase === 'grupos' ? 'Fase de grupos' : 'Playoffs'
  return scope.matchday === null ? `Acumulado · ${phase}` : `Fecha ${scope.matchday} · ${phase}`
}

export function buildPosters(data: StatsData, standings: GroupStandingRow[] = []): Poster[] {
  const kicker = kickerFor(data.scope)
  const wanted = data.scope.matchday === null ? ACCUMULATED : BY_MATCHDAY

  // The numbers go first: they need no review and can be posted right away.
  const numbers = matchdayNumbers(data)
  const opening: Poster[] = numbers
    ? [{ id: numbers.id, block: numbers, kicker, ordered: false }]
    : []

  // Publishing order follows the list, not the registry.
  const ranked = wanted
    .map((id) => STATS.find((stat) => stat.id === id))
    .filter((stat) => stat !== undefined)
    .map((stat) => stat.build(data))
    // Stats without enough data return null and are skipped (e.g. no bans
    // entered, no bans piece).
    .filter((block) => block !== null)
    .map((block) => ({ id: block.id, block, kicker, ordered: true }))

  // A group table is a ranking: the number is the team's position.
  const tables = groupTables(standings).map((block) => ({
    id: block.id,
    block,
    kicker,
    ordered: true,
  }))

  return [...opening, ...ranked, ...tables]
}
