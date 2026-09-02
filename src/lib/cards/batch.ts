/**
 * The batch of pieces for one scope.
 *
 * These are the stats worth publishing, not the 34 in the registry: a feed
 * cannot take one post per ranking, and half of those rankings exist to be
 * looked up, not looked at. The list here is an editorial decision and it is
 * meant to be changed.
 *
 * The batch changes with the scope, which is the point of the whole engine: a
 * matchday is told through whoever broke it open, and the full phase through
 * whoever held it up across three matchdays. That is why there are two lists
 * and not one with more items.
 */

import { STATS } from '@/lib/stats/registry'
import type { StatScope, StatsData } from '@/lib/stats/types'
import type { GroupStandingRow } from '@/types/db'
import { groupTables, matchdayNumbers } from './summary'
import type { Poster } from './types'

/**
 * What gets published for a matchday: the best performer, the starting five,
 * the standout university and the meta. Cumulative rankings like "most kills"
 * are out: within a single matchday they reward whoever played two games
 * instead of one.
 */
export const BY_MATCHDAY = ['mvp', 'quinteto', 'universidad-fecha', 'picks', 'bans']

/**
 * What gets published for the accumulated total: there the totals do mean
 * something, and the records come in, which need several matches to be any fun.
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

/** "Fecha 2 · Fase de grupos", the small line at the top of every piece. */
export function kickerFor(scope: StatScope): string {
  const phase = scope.phase === 'grupos' ? 'Fase de grupos' : 'Playoffs'
  return scope.matchday === null ? `Acumulado · ${phase}` : `Fecha ${scope.matchday} · ${phase}`
}

export function buildPosters(data: StatsData, standings: GroupStandingRow[] = []): Poster[] {
  const kicker = kickerFor(data.scope)
  const wanted = data.scope.matchday === null ? ACCUMULATED : BY_MATCHDAY

  // The numbers first: it is the only one that can go up without anybody
  // reviewing anything, the moment the matchday finishes.
  const numbers = matchdayNumbers(data)
  const opening: Poster[] = numbers
    ? [{ id: numbers.id, block: numbers, kicker, ordered: false }]
    : []

  // The order is the list's, not the registry's: the list is the order they
  // are published in, and there it does matter which one opens.
  const ranked = wanted
    .map((id) => STATS.find((stat) => stat.id === id))
    .filter((stat) => stat !== undefined)
    .map((stat) => stat.build(data))
    // The ones without enough data return null and drop out: with no bans
    // entered there is no bans piece, and an empty card is worse than none.
    .filter((block) => block !== null)
    .map((block) => ({ id: block.id, block, kicker, ordered: true }))

  // The table IS a ranking: the number is the team's position in the group.
  const tables = groupTables(standings).map((block) => ({
    id: block.id,
    block,
    kicker,
    ordered: true,
  }))

  return [...opening, ...ranked, ...tables]
}
