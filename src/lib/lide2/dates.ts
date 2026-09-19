import { AR_TIME_ZONE, CALENDAR, type Milestone } from './tournament'

/**
 * Date formatting for the tournament, on Argentine time unless noted.
 *
 * The output is Spanish: these strings are shown to visitors.
 */

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** "5" + "sep", for the calendar's cards and for the hero. */
export function shortDate(iso: string): { day: string; month: string } {
  const date = new Date(iso)
  return { day: String(date.getUTCDate()), month: MONTHS[date.getUTCMonth()] }
}

/**
 * Days left until a date, counting calendar days in Argentina rather than
 * milliseconds, so the whole match day reads 0 regardless of the hour.
 */
export function daysUntil(iso: string): number {
  const day = (date: Date) => {
    const [year, month, dayOfMonth] = new Intl.DateTimeFormat('en-CA', {
      timeZone: AR_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .format(date)
      .split('-')
      .map(Number)

    /*
      Date.UTC takes a 0-based month and the formatted one is 1-based, so it is
      corrected here. Passing it through shifts both dates a month forward
      instead, which does not cancel out: each lands in a month of a different
      length, and a count crossing September into October gains a day.
    */
    return Date.UTC(year, month - 1, dayOfMonth)
  }

  return Math.round((day(new Date(iso)) - day(new Date())) / 86_400_000)
}

/**
 * Whether a date of the calendar is behind us.
 *
 * The date alone is not enough for the group phase: its last matchday is over
 * the moment its games are in, hours before the day itself ends. Without
 * `groupsDone` the page spends that evening counting down to a matchday that
 * has already been played. Playoff rounds go by their date, which is the only
 * thing the calendar knows about them.
 */
export function milestonePlayed(milestone: Milestone, groupsDone: boolean): boolean {
  return daysUntil(milestone.date) < 0 || (groupsDone && milestone.phase === 'grupos')
}

/** The date the tournament is heading to: the first one not behind us. */
export function nextMilestone(groupsDone: boolean): Milestone | undefined {
  return CALENDAR.find((milestone) => !milestonePlayed(milestone, groupsDone))
}

/**
 * "26 de septiembre", for the playoff rounds.
 *
 * Uses UTC because playoff series store a date without a time, and converting
 * it to Argentine time would move it back a day.
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
 * "14:00", on Argentine time.
 *
 * `hourCycle: 'h23'` is required: without it `es-AR` returns "02:00 p. m.",
 * and `hour12: false` would print midnight as "24:00".
 */
export function timeOfDay(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: AR_TIME_ZONE,
  })
}
