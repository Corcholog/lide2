import { describe, expect, it } from 'vitest'
import { planRosterEdit, readRosterForm, type RosterCurrentRow } from '@/lib/roster/edit'

/**
 * Los cambios de plantel del panel.
 *
 * El caso modelo es el Equipo 15 de verdad: cinco personas de tres
 * universidades. Antes de que empiece el torneo se cae uno, entra otro y hay un
 * nombre que la planilla trajo mal.
 */

const EQUIPO = 'equipo-15'
const UNER = 'uni-uner'
const UADE = 'uni-uade'

/** Los cinco, con los índices que dejó el seed. */
const PLANTEL: RosterCurrentRow[] = [
  { id: 'r1', orderIndex: 0 },
  { id: 'r2', orderIndex: 1 },
  { id: 'r3', orderIndex: 2 },
  { id: 'r4', orderIndex: 3 },
  { id: 'r5', orderIndex: 4 },
]

/** Arma el formulario que manda el navegador, en el orden de la pantalla. */
function formulario(
  filas: {
    clave: string
    nuevo?: boolean
    baja?: boolean
    nombre?: string
    universidad?: string
    riot?: string
    player?: string
  }[],
): FormData {
  const form = new FormData()
  form.set('teamId', EQUIPO)

  for (const fila of filas) {
    form.set(`fila-${fila.clave}`, fila.nuevo ? 'nuevo' : 'existente')
    if (fila.baja) form.set(`baja-${fila.clave}`, '1')
    form.set(`nombre-${fila.clave}`, fila.nombre ?? '')
    form.set(`universidad-${fila.clave}`, fila.universidad ?? '')
    form.set(`riot-${fila.clave}`, fila.riot ?? '')
    form.set(`player-${fila.clave}`, fila.player ?? '')
  }

  return form
}

/** Las cinco filas sin tocar nada, que es como llega el formulario recién abierto. */
const SIN_CAMBIOS = PLANTEL.map((row) => ({ clave: row.id, nombre: `Inscripto ${row.id}` }))

describe('leer el formulario del plantel', () => {
  it('respeta el orden de la pantalla y distingue las filas nuevas', () => {
    const filas = readRosterForm(
      formulario([
        { clave: 'r1', nombre: 'Denis Chang' },
        { clave: 'r2', nombre: 'Gabriel Pareja' },
        { clave: 'nuevo-0', nuevo: true, nombre: 'Alexis Costas' },
      ]),
    )

    expect(filas.map((fila) => [fila.key, fila.isNew])).toEqual([
      ['r1', false],
      ['r2', false],
      ['nuevo-0', true],
    ])
  })

  it('lee la baja, que es un campo que sólo viaja cuando está tildado', () => {
    const filas = readRosterForm(
      formulario([
        { clave: 'r1', nombre: 'Denis Chang', baja: true },
        { clave: 'r2', nombre: 'Gabriel Pareja' },
      ]),
    )

    expect(filas.map((fila) => fila.baja)).toEqual([true, false])
  })

  it('recorta los espacios: un nombre con espacios de más no es un nombre distinto', () => {
    const [fila] = readRosterForm(
      formulario([{ clave: 'r1', nombre: '  Denis Chang  ', riot: ' DenisChang#LAN ' }]),
    )

    expect(fila.nombre).toBe('Denis Chang')
    expect(fila.riot).toBe('DenisChang#LAN')
  })
})

describe('planificar los cambios de plantel', () => {
  it('modificar escribe el nombre, la universidad y el Riot ID partido en dos', () => {
    const plan = planRosterEdit(
      EQUIPO,
      readRosterForm(
        formulario([
          ...SIN_CAMBIOS.slice(1),
          // El primero, corregido: la planilla lo trajo sin la universidad.
          { clave: 'r1', nombre: 'Denis Chang', universidad: UNER, riot: 'DenisChang#LAN' },
        ]),
      ),
      PLANTEL,
    )

    if (!plan.ok) throw new Error(plan.error)

    expect(plan.remove).toEqual([])
    expect(plan.create).toEqual([])
    expect(plan.update).toHaveLength(5)
    expect(plan.update.find((row) => row.id === 'r1')).toEqual({
      id: 'r1',
      team_id: EQUIPO,
      full_name: 'Denis Chang',
      university_id: UNER,
      order_index: 0,
      riot_game_name: 'DenisChang',
      riot_tag_line: 'LAN',
      player_id: null,
    })
  })

  it('el alta va al final y el resto queda con su lugar de la planilla', () => {
    const plan = planRosterEdit(
      EQUIPO,
      readRosterForm(
        formulario([
          ...SIN_CAMBIOS,
          { clave: 'nuevo-0', nuevo: true, nombre: 'Suplente que entró', universidad: UADE },
        ]),
      ),
      PLANTEL,
    )

    if (!plan.ok) throw new Error(plan.error)

    expect(plan.create).toEqual([
      {
        team_id: EQUIPO,
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

  it('la baja saca la fila y no toca a los demás', () => {
    const plan = planRosterEdit(
      EQUIPO,
      readRosterForm(
        formulario(SIN_CAMBIOS.map((fila) => (fila.clave === 'r3' ? { ...fila, baja: true } : fila))),
      ),
      PLANTEL,
    )

    if (!plan.ok) throw new Error(plan.error)

    expect(plan.remove).toEqual(['r3'])
    expect(plan.update.map((row) => row.id)).toEqual(['r1', 'r2', 'r4', 'r5'])
  })

  /**
   * `order_index` no se recompacta: tiene un único por equipo y renumerar las
   * filas que quedan obligaría a moverlas en dos pasos. Lo que importa es que el
   * alta no caiga en el hueco que dejó la baja de la misma tanda, porque en ese
   * momento la fila vieja todavía existe.
   */
  it('una baja y un alta juntas: el nuevo no se mete en el hueco que quedó', () => {
    const plan = planRosterEdit(
      EQUIPO,
      readRosterForm(
        formulario([
          ...SIN_CAMBIOS.map((fila) => (fila.clave === 'r5' ? { ...fila, baja: true } : fila)),
          { clave: 'nuevo-0', nuevo: true, nombre: 'El reemplazo' },
        ]),
      ),
      PLANTEL,
    )

    if (!plan.ok) throw new Error(plan.error)

    expect(plan.remove).toEqual(['r5'])
    expect(plan.create[0].order_index).toBe(5)
  })

  it('una fila nueva que quedó en blanco se descarta sin chistar', () => {
    const plan = planRosterEdit(
      EQUIPO,
      readRosterForm(formulario([...SIN_CAMBIOS, { clave: 'nuevo-0', nuevo: true }])),
      PLANTEL,
    )

    if (!plan.ok) throw new Error(plan.error)
    expect(plan.create).toEqual([])
  })

  it('una fila con datos pero sin nombre es un error, no una fila que se tira', () => {
    const plan = planRosterEdit(
      EQUIPO,
      readRosterForm(
        formulario([...SIN_CAMBIOS, { clave: 'nuevo-0', nuevo: true, riot: 'Alguien#LAN' }]),
      ),
      PLANTEL,
    )

    expect(plan.ok).toBe(false)
  })

  it('borrarle el nombre a un inscripto no lo da de baja: hay que quitarlo', () => {
    const plan = planRosterEdit(
      EQUIPO,
      readRosterForm(formulario(SIN_CAMBIOS.map((fila) => ({ ...fila, nombre: '' })))),
      PLANTEL,
    )

    expect(plan.ok).toBe(false)
  })

  it('la misma cuenta para dos inscriptos se rechaza antes de escribir nada', () => {
    const plan = planRosterEdit(
      EQUIPO,
      readRosterForm(
        formulario(
          SIN_CAMBIOS.map((fila) =>
            fila.clave === 'r1' || fila.clave === 'r2' ? { ...fila, player: 'p-denis' } : fila,
          ),
        ),
      ),
      PLANTEL,
    )

    expect(plan).toEqual({ ok: false, error: 'Hay una misma cuenta elegida para dos inscriptos.' })
  })

  it('la cuenta de alguien que se da de baja queda libre para otro en la misma tanda', () => {
    const plan = planRosterEdit(
      EQUIPO,
      readRosterForm(
        formulario(
          SIN_CAMBIOS.map((fila) => {
            if (fila.clave === 'r1') return { ...fila, baja: true, player: 'p-denis' }
            if (fila.clave === 'r2') return { ...fila, player: 'p-denis' }
            return fila
          }),
        ),
      ),
      PLANTEL,
    )

    if (!plan.ok) throw new Error(plan.error)
    expect(plan.remove).toEqual(['r1'])
    expect(plan.update.find((row) => row.id === 'r2')?.player_id).toBe('p-denis')
  })

  /**
   * El formulario manda el plantel entero, así que si le falta una fila que
   * existe es un formulario viejo: se dibujó antes de que otra pestaña editara
   * el plantel. Aplicarlo daría de baja a alguien que nadie tocó.
   */
  it('un formulario viejo se rechaza entero en vez de aplicarse a medias', () => {
    const viejo = planRosterEdit(
      EQUIPO,
      readRosterForm(formulario(SIN_CAMBIOS.slice(0, 4))),
      PLANTEL,
    )
    expect(viejo.ok).toBe(false)

    const fantasma = planRosterEdit(
      EQUIPO,
      readRosterForm(formulario([...SIN_CAMBIOS, { clave: 'r9', nombre: 'No existe' }])),
      PLANTEL,
    )
    expect(fantasma.ok).toBe(false)
  })

  it('un equipo sin nadie anotado se puede llenar de cero', () => {
    const plan = planRosterEdit(
      EQUIPO,
      readRosterForm(
        formulario([
          { clave: 'nuevo-0', nuevo: true, nombre: 'Primero', universidad: UNER },
          { clave: 'nuevo-1', nuevo: true, nombre: 'Segundo' },
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
