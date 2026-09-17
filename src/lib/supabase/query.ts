import type { PostgrestError } from '@supabase/supabase-js'

/**
 * Reads query results without swallowing errors.
 *
 * With `data ?? []`, a broken policy, a renamed column or an outage would look
 * the same as "nothing played yet". These helpers throw instead, and error.tsx
 * shows the failure with a retry. A page with one failed query fails whole, on
 * purpose: a partial standings table would be wrong, not just incomplete.
 *
 * `what` names the query in the server log; in production the browser only
 * gets the error digest.
 */
interface Result<T> {
  data: T | null
  error: PostgrestError | null
}

function fail(what: string, error: PostgrestError): never {
  throw new Error(`Could not read ${what}: ${error.message} (${error.code})`, { cause: error })
}

/** The rows of a listing. Empty is a valid result; an error is not. */
export function rows<T>(result: Result<T[]>, what: string): T[] {
  if (result.error) fail(what, result.error)
  return result.data ?? []
}

/**
 * A row that may not exist (`maybeSingle`). Null is a valid result (e.g. a
 * missing team is a 404); only a failed query throws.
 */
export function maybeRow<T>(result: Result<T>, what: string): T | null {
  if (result.error) fail(what, result.error)
  return result.data
}
