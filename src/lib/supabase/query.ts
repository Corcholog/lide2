import type { PostgrestError } from '@supabase/supabase-js'

/**
 * Reading the result of a query without swallowing the error.
 *
 * The `data ?? []` pattern is convenient and it is a trap: a broken policy, a
 * renamed column or Supabase being down all return `data: null` with an `error`
 * next to it, and the page ends up drawing its empty state. Which means "the
 * database fell over" and "nothing has been played yet" look exactly the same,
 * which is the last thing anyone wants on a match day.
 *
 * Here the error is thrown and the site's error.tsx catches it, showing what
 * happened and offering to retry. Partial rendering is lost — if one of the
 * home page's four queries fails, none of them is shown — and that is on
 * purpose: a standings table missing one query is not incomplete, it is wrong,
 * and showing it anyway is worse than showing nothing.
 *
 * `what` is what reaches the server log. In production the real message never
 * travels to the browser, so without it the error's `digest` leads nowhere.
 */
interface Result<T> {
  data: T | null
  error: PostgrestError | null
}

function boom(what: string, error: PostgrestError): never {
  throw new Error(`Could not read ${what}: ${error.message} (${error.code})`, { cause: error })
}

/** The rows of a listing. Empty is a valid result; an error is not. */
export function rows<T>(result: Result<T[]>, what: string): T[] {
  if (result.error) boom(what, result.error)
  return result.data ?? []
}

/**
 * A row that may not exist (`maybeSingle`).
 *
 * Returning null is legitimate — a team that does not exist is a 404, not an
 * error — so all this tells apart is "it is not there" from "it could not be
 * asked".
 */
export function maybeRow<T>(result: Result<T>, what: string): T | null {
  if (result.error) boom(what, result.error)
  return result.data
}
