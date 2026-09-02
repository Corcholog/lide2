import { describe, expect, it } from 'vitest'
import { maybeRow, rows } from '@/lib/supabase/query'
import type { PostgrestError } from '@supabase/supabase-js'

/**
 * That a query error never disguises itself as "nothing here yet".
 *
 * It is the difference that matters on a match day: without this, a broken
 * policy and an unplayed matchday look exactly the same on screen.
 */

const failure: PostgrestError = Object.assign(new Error('permission denied for table matches'), {
  code: '42501',
  details: '',
  hint: '',
  name: 'PostgrestError',
  toJSON: () => ({}),
}) as unknown as PostgrestError

describe('reading a query', () => {
  it('empty is a valid result', () => {
    expect(rows({ data: [], error: null }, 'the matches')).toEqual([])
  })

  it('null with no error too: PostgREST sometimes sends no array', () => {
    expect(rows({ data: null, error: null }, 'the matches')).toEqual([])
  })

  it('returns the rows when there are any', () => {
    expect(rows({ data: [{ id: 1 }], error: null }, 'the matches')).toEqual([{ id: 1 }])
  })

  it('an error blows up instead of returning empty', () => {
    expect(() => rows({ data: null, error: failure }, 'the matches')).toThrow(
      /Could not read the matches/,
    )
  })

  it('the message carries the code, which is what gets searched in the logs', () => {
    expect(() => rows({ data: null, error: failure }, 'the matches')).toThrow(/42501/)
  })

  it('and keeps the original error as the cause', () => {
    try {
      rows({ data: null, error: failure }, 'the matches')
      expect.unreachable()
    } catch (error) {
      expect((error as Error).cause).toBe(failure)
    }
  })

  it('blows up even when data arrived: after an error the data is not trustworthy', () => {
    expect(() => rows({ data: [{ id: 1 }], error: failure }, 'the matches')).toThrow()
  })
})

describe('reading a row that may not exist', () => {
  it('null means "it is not there", and that is not an error', () => {
    expect(maybeRow({ data: null, error: null }, 'the team')).toBeNull()
  })

  it('but "it could not be asked" is', () => {
    expect(() => maybeRow({ data: null, error: failure }, 'the team')).toThrow(
      /Could not read the team/,
    )
  })
})
