import { AR_TIME_ZONE } from './tournament'

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

  // Date.UTC months are 0-based and the formatted ones 1-based; both sides are
  // shifted by the same amount, so the difference is unaffected.
  return Math.round((day(new Date(iso)) - day(new Date())) / 86_400_000)
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
