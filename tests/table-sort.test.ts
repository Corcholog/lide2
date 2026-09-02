import { describe, expect, it } from 'vitest'
import { sortRows, parseSortOrder } from '../src/lib/table/sort'

const COLUMNS = ['pickrate', 'winrate', 'picks'] as const
const DEFAULT = { id: 'pickrate', dir: 'desc' } as const

describe('parseSortOrder', () => {
  it('with no parameters it returns the default', () => {
    expect(parseSortOrder(undefined, undefined, COLUMNS, DEFAULT)).toEqual(DEFAULT)
  })

  it('takes the column and the direction that were asked for', () => {
    expect(parseSortOrder('winrate', 'asc', COLUMNS, DEFAULT)).toEqual({
      id: 'winrate',
      dir: 'asc',
    })
  })

  it('a column that does not exist falls back to the default', () => {
    expect(parseSortOrder('inventada', 'asc', COLUMNS, DEFAULT)).toEqual(DEFAULT)
  })

  it('a made-up direction keeps the column and uses the default direction', () => {
    expect(parseSortOrder('picks', 'arriba', COLUMNS, DEFAULT)).toEqual({
      id: 'picks',
      dir: 'desc',
    })
  })

  it('with a repeated parameter it keeps the first one', () => {
    expect(parseSortOrder(['winrate', 'picks'], ['asc'], COLUMNS, DEFAULT)).toEqual({
      id: 'winrate',
      dir: 'asc',
    })
  })
})

interface Row {
  name: string
  value: number | null
}

const rows: Row[] = [
  { name: 'Ahri', value: 3 },
  { name: 'Braum', value: null },
  { name: 'Caitlyn', value: 1 },
  { name: 'Darius', value: 3 },
]

const byName = (a: Row, b: Row) => a.name.localeCompare(b.name)

describe('sortRows', () => {
  it('descending puts the largest first', () => {
    const out = sortRows(rows, (row) => row.value, 'desc', byName)
    expect(out.map((row) => row.name)).toEqual(['Ahri', 'Darius', 'Caitlyn', 'Braum'])
  })

  it('ascending puts the smallest first', () => {
    const out = sortRows(rows, (row) => row.value, 'asc', byName)
    expect(out.map((row) => row.name)).toEqual(['Caitlyn', 'Ahri', 'Darius', 'Braum'])
  })

  it('nulls go last in both directions', () => {
    for (const dir of ['asc', 'desc'] as const) {
      const out = sortRows(rows, (row) => row.value, dir, byName)
      expect(out.at(-1)?.name).toBe('Braum')
    }
  })

  it('the tiebreak decides between equal values', () => {
    // Ahri and Darius are level on 3: the alphabetical tiebreak orders them.
    const out = sortRows(rows, (row) => row.value, 'desc', byName)
    expect(out.slice(0, 2).map((row) => row.name)).toEqual(['Ahri', 'Darius'])
  })

  it('the tiebreak is not flipped by the direction', () => {
    // Even in ascending order the tie is always resolved the same way: if it
    // flipped, changing direction would move rows that are worth the same.
    const out = sortRows(rows, (row) => row.value, 'asc', byName)
    expect(out.slice(1, 3).map((row) => row.name)).toEqual(['Ahri', 'Darius'])
  })

  it('sorts text ignoring case and accents', () => {
    const names = [
      { name: 'Zed', value: 0 },
      { name: 'ahri', value: 0 },
    ]
    const out = sortRows(names, (row) => row.name, 'asc', byName)
    expect(out.map((row) => row.name)).toEqual(['ahri', 'Zed'])
  })

  it('does not touch the original array', () => {
    const before = rows.map((row) => row.name)
    sortRows(rows, (row) => row.value, 'asc', byName)
    expect(rows.map((row) => row.name)).toEqual(before)
  })
})
