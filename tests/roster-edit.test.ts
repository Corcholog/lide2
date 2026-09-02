import { describe, expect, it } from 'vitest'
import { planRosterEdit, readRosterForm, type RosterCurrentRow } from '@/lib/roster/edit'

/**
 * The panel's roster edits.
 *
 * The model case is the real Team 15: five people from three universities.
 * Before the tournament starts one drops out, another comes in and there is a
 * name the sheet got wrong.
 */

const TEAM = 'equipo-15'
const UNER = 'uni-uner'
const UADE = 'uni-uade'

/** The five, with the indexes the seed left. */
const ROSTER: RosterCurrentRow[] = [
  { id: 'r1', orderIndex: 0 },
  { id: 'r2', orderIndex: 1 },
  { id: 'r3', orderIndex: 2 },
  { id: 'r4', orderIndex: 3 },
  { id: 'r5', orderIndex: 4 },
]

/**
 * Builds the form the browser sends, in the order it appears on screen.
 *
 * The field names stay in Spanish: they are the contract with the markup in
 * `RosterTeam.tsx`, which `readRosterForm` reads back.
 */
function buildForm(
  rows: {
    key: string
    isNew?: boolean
    removed?: boolean
    name?: string
    university?: string
    riot?: string
    player?: string
  }[],
): FormData {
  const form = new FormData()
  form.set('teamId', TEAM)

  for (const row of rows) {
    form.set(`fila-${row.key}`, row.isNew ? 'nuevo' : 'existente')
    if (row.removed) form.set(`baja-${row.key}`, '1')
    form.set(`nombre-${row.key}`, row.name ?? '')
    form.set(`universidad-${row.key}`, row.university ?? '')
    form.set(`riot-${row.key}`, row.riot ?? '')
    form.set(`player-${row.key}`, row.player ?? '')
  }

  return form
}

/** The five rows with nothing touched, which is how a freshly opened form arrives. */
const UNCHANGED = ROSTER.map((row) => ({ key: row.id, name: `Inscripto ${row.id}` }))

describe('reading the roster form', () => {
  it('honours the screen order and tells the new rows apart', () => {
    const rows = readRosterForm(
      buildForm([
        { key: 'r1', name: 'Denis Chang' },
        { key: 'r2', name: 'Gabriel Pareja' },
        { key: 'nuevo-0', isNew: true, name: 'Alexis Costas' },
      ]),
    )

    expect(rows.map((row) => [row.key, row.isNew])).toEqual([
      ['r1', false],
      ['r2', false],
      ['nuevo-0', true],
    ])
  })

  it('reads the removal, a field that only travels when it is ticked', () => {
    const rows = readRosterForm(
      buildForm([
        { key: 'r1', name: 'Denis Chang', removed: true },
        { key: 'r2', name: 'Gabriel Pareja' },
      ]),
    )

    expect(rows.map((row) => row.removed)).toEqual([true, false])
  })

  it('trims the spaces: a name with extra spaces is not a different name', () => {
    const [row] = readRosterForm(
      buildForm([{ key: 'r1', name: '  Denis Chang  ', riot: ' DenisChang#LAN ' }]),
    )

    expect(row.fullName).toBe('Denis Chang')
    expect(row.riot).toBe('DenisChang#LAN')
  })
})

describe('planning the roster edits', () => {
  it('editing writes the name, the university and the Riot ID split in two', () => {
    const plan = planRosterEdit(
      TEAM,
      readRosterForm(
        buildForm([
          ...UNCHANGED.slice(1),
          // The first one, corrected: the sheet brought it with no university.
          { key: 'r1', name: 'Denis Chang', university: UNER, riot: 'DenisChang#LAN' },
        ]),
      ),
      ROSTER,
    )

    if (!plan.ok) throw new Error(plan.error)

    expect(plan.remove).toEqual([])
    expect(plan.create).toEqual([])
    expect(plan.update).toHaveLength(5)
    expect(plan.update.find((row) => row.id === 'r1')).toEqual({
      id: 'r1',
      team_id: TEAM,
      full_name: 'Denis Chang',
      university_id: UNER,
      order_index: 0,
      riot_game_name: 'DenisChang',
      riot_tag_line: 'LAN',
      player_id: null,
    })
  })

  it('the addition goes last and the rest keep their place from the sheet', () => {
    const plan = planRosterEdit(
      TEAM,
      readRosterForm(
        buildForm([
          ...UNCHANGED,
          { key: 'nuevo-0', isNew: true, name: 'Suplente que entró', university: UADE },
        ]),
      ),
      ROSTER,
    )

    if (!plan.ok) throw new Error(plan.error)

    expect(plan.create).toEqual([
      {
        team_id: TEAM,
        full_name: 'Suplente que entró',
        university_id: UADE,
        order_index: 5,
        riot_game_name: null,
        riot_tag_line: null,
        player_id: null,
      },
    ])
    expect(plan.update.map((row) => row.order_index)).toEqual([0, 1, 2, 3, 4])
  })

  it('the removal takes the row out and does not touch the others', () => {
    const plan = planRosterEdit(
      TEAM,
      readRosterForm(
        buildForm(UNCHANGED.map((row) => (row.key === 'r3' ? { ...row, removed: true } : row))),
      ),
      ROSTER,
    )

    if (!plan.ok) throw new Error(plan.error)

    expect(plan.remove).toEqual(['r3'])
    expect(plan.update.map((row) => row.id)).toEqual(['r1', 'r2', 'r4', 'r5'])
  })

  /**
   * `order_index` is not recompacted: it is unique per team and renumbering the
   * remaining rows would mean moving them in two passes. What matters is that
   * the addition does not land in the gap left by a removal in the same batch,
   * because at that moment the old row still exists.
   */
  it('a removal and an addition together: the new one does not fill the gap', () => {
    const plan = planRosterEdit(
      TEAM,
      readRosterForm(
        buildForm([
          ...UNCHANGED.map((row) => (row.key === 'r5' ? { ...row, removed: true } : row)),
          { key: 'nuevo-0', isNew: true, name: 'El reemplazo' },
        ]),
      ),
      ROSTER,
    )

    if (!plan.ok) throw new Error(plan.error)

    expect(plan.remove).toEqual(['r5'])
    expect(plan.create[0].order_index).toBe(5)
  })

  it('a new row left blank is discarded without a word', () => {
    const plan = planRosterEdit(
      TEAM,
      readRosterForm(buildForm([...UNCHANGED, { key: 'nuevo-0', isNew: true }])),
      ROSTER,
    )

    if (!plan.ok) throw new Error(plan.error)
    expect(plan.create).toEqual([])
  })

  it('a row with data but no name is an error, not a row to throw away', () => {
    const plan = planRosterEdit(
      TEAM,
      readRosterForm(
        buildForm([...UNCHANGED, { key: 'nuevo-0', isNew: true, riot: 'Alguien#LAN' }]),
      ),
      ROSTER,
    )

    expect(plan.ok).toBe(false)
  })

  it('clearing a signup name does not remove them: they have to be taken out', () => {
    const plan = planRosterEdit(
      TEAM,
      readRosterForm(buildForm(UNCHANGED.map((row) => ({ ...row, name: '' })))),
      ROSTER,
    )

    expect(plan.ok).toBe(false)
  })

  it('the same account for two signups is rejected before anything is written', () => {
    const plan = planRosterEdit(
      TEAM,
      readRosterForm(
        buildForm(
          UNCHANGED.map((row) =>
            row.key === 'r1' || row.key === 'r2' ? { ...row, player: 'p-denis' } : row,
          ),
        ),
      ),
      ROSTER,
    )

    expect(plan).toEqual({ ok: false, error: 'Hay una misma cuenta elegida para dos inscriptos.' })
  })

  it('the account of somebody removed is free for another in the same batch', () => {
    const plan = planRosterEdit(
      TEAM,
      readRosterForm(
        buildForm(
          UNCHANGED.map((row) => {
            if (row.key === 'r1') return { ...row, removed: true, player: 'p-denis' }
            if (row.key === 'r2') return { ...row, player: 'p-denis' }
            return row
          }),
        ),
      ),
      ROSTER,
    )

    if (!plan.ok) throw new Error(plan.error)
    expect(plan.remove).toEqual(['r1'])
    expect(plan.update.find((row) => row.id === 'r2')?.player_id).toBe('p-denis')
  })

  /**
   * The form sends the whole roster, so if a row that exists is missing from it
   * the form is stale: it was drawn before another tab edited the roster.
   * Applying it would remove somebody nobody touched.
   */
  it('a stale form is rejected whole instead of being half applied', () => {
    const stale = planRosterEdit(TEAM, readRosterForm(buildForm(UNCHANGED.slice(0, 4))), ROSTER)
    expect(stale.ok).toBe(false)

    const ghost = planRosterEdit(
      TEAM,
      readRosterForm(buildForm([...UNCHANGED, { key: 'r9', name: 'No existe' }])),
      ROSTER,
    )
    expect(ghost.ok).toBe(false)
  })

  it('a team with nobody signed up can be filled from scratch', () => {
    const plan = planRosterEdit(
      TEAM,
      readRosterForm(
        buildForm([
          { key: 'nuevo-0', isNew: true, name: 'Primero', university: UNER },
          { key: 'nuevo-1', isNew: true, name: 'Segundo' },
        ]),
      ),
      [],
    )

    if (!plan.ok) throw new Error(plan.error)
    expect(plan.create.map((row) => [row.full_name, row.order_index])).toEqual([
      ['Primero', 0],
      ['Segundo', 1],
    ])
  })
})
