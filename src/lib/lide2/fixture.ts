import type { FixtureResultRow } from '@/types/db'

/**
 * Reading the state of the group-phase fixture.
 *
 * Kept out of the components because the home page and the fixture table both
 * ask the same question and must not answer it differently.
 */

/**
 * A matchup with an outcome. "Decided" rather than "played": walkovers and
 * rulings have an outcome but no game.
 */
export function isDecided(row: FixtureResultRow): boolean {
  return row.status === 'jugado' || row.status === 'w.o.' || row.status === 'reglamento'
}

/**
 * Whether the group phase is over, meaning every published matchup has an
 * outcome.
 *
 * From the results and not from the calendar: the last matchday is over the
 * moment its games are in, hours before the date itself passes, and that is
 * when the standings become final. An empty fixture is not a finished one.
 */
export function groupsFinished(fixture: FixtureResultRow[]): boolean {
  return fixture.length > 0 && fixture.every(isDecided)
}
