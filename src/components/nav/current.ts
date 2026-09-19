/**
 * Which tab a tab set opens on.
 *
 * Its own module, not part of `Tabs`: the callers are Server Components, and a
 * function exported from a `'use client'` file cannot be called from the
 * server, only rendered or passed as a prop.
 */

/**
 * The first tab still being played, or the last one once everything is
 * decided. `decided` has one entry per tab, in the same order.
 *
 * Both tab sets on the home page use it so they follow the tournament instead
 * of always opening on its first round. Callers decide what "decided" means
 * and compute it on the server, so the rendered HTML already has the right tab
 * active and hydration agrees with it.
 */
export function currentTab(decided: boolean[]): number {
  const playing = decided.indexOf(false)

  return playing === -1 ? Math.max(0, decided.length - 1) : playing
}
