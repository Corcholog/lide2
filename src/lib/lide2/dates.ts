import { AR_TIME_ZONE } from './tournament'

/**
 * Formatting the tournament's dates, always on Argentine time.
 *
 * These used to live inside the home page, which is where they are all used -
 * the hero's countdown, the calendar, the fixture's tabs, the bracket, the
 * final. They come out here because the page splits into sections that each
 * need a couple of them, and having every section keep its own copy is how two
 * dates on the same screen end up disagreeing.
 *
 * The output stays in Spanish: these strings are read by visitors.
 */

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** "5" + "sep", for the calendar's cards and for the hero. */
export function shortDate(iso: string): { day: string; month: string } {
  const date = new Date(iso)
  return { day: String(date.getUTCDate()), month: MONTHS[date.getUTCMonth()] }
}

/**
 * How many days are left, counting calendar days and not milliseconds.
 *
 * The earlier version divided the difference by 86,400,000 and rounded up, and
 * that flipped over on precisely the day that matters: at nine in the morning
 * on 5 September there were five hours to kickoff, the division came to 0.2 and
 * the `ceil` showed "1 day left". It only said "¡HOY!" once the game had
 * started, which is when it is no longer any use.
 *
 * Now the two dates are compared at midnight in Argentina - the tournament's
 * time - so the whole of 5 September gives 0, whatever the hour.
 */
export function daysUntil(iso: string): number {
  const day = (date: Date) =>
    Date.UTC(
      ...(new Intl.DateTimeFormat('en-CA', {
        timeZone: AR_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
        .format(date)
        .split('-')
        .map(Number) as [number, number, number]),
    )

  // Date.UTC's month runs 0 to 11 and the formatted date's runs 1 to 12; a
  // subtraction between two values shifted by the same amount never notices.
  return Math.round((day(new Date(iso)) - day(new Date())) / 86_400_000)
}

/**
 * "26 de septiembre", for the playoff rounds.
 *
 * It goes in UTC and not in the tournament's time zone because the playoff
 * series carry a date with no time: putting those through America/Argentina
 * would shift them a day backwards.
 */
export function dayAndMonth(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })
}

/** "sábado 5 de septiembre", for the matchday button. */
export function weekdayAndDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: AR_TIME_ZONE,
  })
}

/**
 * "14:00". The tournament's hours are Argentina's.
 *
 * `hourCycle: 'h23'` is not decorative: without it, `es-AR` in the ICU that
 * Node and the browsers ship returns "02:00 p. m.". And it is h23 and not
 * `hour12: false`, which gives "24:00" instead of "00:00" for midnight.
 */
export function timeOfDay(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: AR_TIME_ZONE,
  })
}
