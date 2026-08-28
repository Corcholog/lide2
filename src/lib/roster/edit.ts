/**
 * Los cambios de plantel, antes de que empiece el torneo.
 *
 * La planilla de inscripción no es definitiva: alguien se baja, entra un
 * suplente, otro se anotó con el nombre mal escrito. Hasta acá el panel sólo
 * sabía emparejar inscriptos con cuentas de Riot; los inscriptos en sí venían
 * del seed y no había forma de tocarlos sin entrar al SQL editor de Supabase.
 *
 * Este archivo es la parte que se puede probar sin base: leer el formulario de
 * un equipo y decidir qué se da de baja, qué se actualiza y qué se crea. Las
 * escrituras las hace `saveTeamRosterAction`.
 *
 * Dos reglas que conviene conocer antes de tocarlo:
 *
 * 1. EL FORMULARIO MANDA EL PLANTEL ENTERO, no el cambio. Si lo que llega no
 *    cubre exactamente las filas que hay hoy en la base, no se escribe nada:
 *    quiere decir que el plantel se editó en otra pestaña, y aplicar encima un
 *    formulario viejo daría de baja a alguien que nadie tocó.
 *
 * 2. `order_index` NO SE RECOMPACTA al dar de baja. Es el orden de la planilla
 *    y tiene un único por equipo, así que renumerar las filas que quedan
 *    obligaría a moverlas en dos pasos para no chocar contra ese índice a mitad
 *    de camino. Lo único que se ganaría es una numeración sin huecos, y las
 *    páginas numeran por posición en la lista y no por este campo.
 */

import { parseRiotId } from '@/lib/format'

/** Una fila del formulario, tal como la manda el navegador. */
export interface RosterFormRow {
  /** El id del inscripto, o `nuevo-N` mientras la fila no exista en la base. */
  key: string
  /** Si todavía no existe: se crea en vez de actualizarse. */
  isNew: boolean
  /** Tildado "quitar": se da de baja al guardar. */
  baja: boolean
  nombre: string
  universityId: string
  /** El Riot ID escrito a mano, "Nombre#TAG". */
  riot: string
  /** La cuenta elegida del desplegable. */
  playerId: string
}

/** Un inscripto tal como está hoy en la base. Sin el nombre: no hace falta. */
export interface RosterCurrentRow {
  id: string
  orderIndex: number
}

/** Una fila lista para escribir en `team_roster`. */
export interface RosterWriteRow {
  team_id: string
  full_name: string
  university_id: string | null
  order_index: number
  riot_game_name: string | null
  riot_tag_line: string | null
  player_id: string | null
}

export type RosterPlan =
  | { ok: false; error: string }
  | {
      ok: true
      /** Ids a borrar de `team_roster`. */
      remove: string[]
      /** Los que ya existían, con su id. */
      update: (RosterWriteRow & { id: string })[]
      /** Los que se agregan. Sin id: lo pone la base. */
      create: RosterWriteRow[]
    }

/**
 * Junta las filas del formulario.
 *
 * Cada inscripto manda un `fila-<clave>` oculto y sus campos con esa misma
 * clave detrás. El oculto es el que define qué filas hay: los `<input>` de una
 * fila tildada para dar de baja podrían no llegar, y un `<checkbox>` sin tildar
 * no llega nunca.
 *
 * El orden es el del formulario, que es el de la pantalla.
 */
export function readRosterForm(formData: FormData): RosterFormRow[] {
  const field = (name: string, key: string) => String(formData.get(`${name}-${key}`) ?? '').trim()

  const rows: RosterFormRow[] = []
  for (const name of formData.keys()) {
    if (!name.startsWith('fila-')) continue
    const key = name.slice('fila-'.length)

    rows.push({
      key,
      isNew: String(formData.get(name)) === 'nuevo',
      baja: formData.get(`baja-${key}`) !== null,
      nombre: field('nombre', key),
      universityId: field('universidad', key),
      riot: field('riot', key),
      playerId: field('player', key),
    })
  }

  return rows
}

/** Una fila nueva que quedó sin tocar: el botón "Agregar" y nada más. */
function enBlanco(row: RosterFormRow): boolean {
  return !row.nombre && !row.riot && !row.playerId
}

export function planRosterEdit(
  teamId: string,
  form: RosterFormRow[],
  current: RosterCurrentRow[],
): RosterPlan {
  const actual = new Map(current.map((row) => [row.id, row]))

  const remove: string[] = []
  const update: (RosterWriteRow & { id: string })[] = []
  const create: RosterWriteRow[] = []
  const vistos = new Set<string>()

  // Los nuevos van al final. Ver la regla 2 de arriba: se toma el máximo que
  // haya y no la cantidad de filas, porque después de una baja hay huecos.
  let siguiente = current.reduce((max, row) => Math.max(max, row.orderIndex), -1) + 1

  for (const row of form) {
    if (row.isNew && enBlanco(row)) continue

    const existente = row.isNew ? null : actual.get(row.key)

    if (!row.isNew) {
      if (!existente) {
        return { ok: false, error: 'El plantel cambió mientras lo editabas. Recargá la página.' }
      }
      vistos.add(row.key)

      if (row.baja) {
        remove.push(row.key)
        continue
      }
    }

    if (!row.nombre) {
      return { ok: false, error: 'Hay un inscripto sin nombre. Escribilo o quitá la fila.' }
    }

    const riot = parseRiotId(row.riot)
    const fila: RosterWriteRow = {
      team_id: teamId,
      full_name: row.nombre,
      university_id: row.universityId || null,
      order_index: existente ? existente.orderIndex : siguiente++,
      riot_game_name: riot?.gameName ?? null,
      riot_tag_line: riot?.tagLine ?? null,
      player_id: row.playerId || null,
    }

    if (existente) update.push({ ...fila, id: existente.id })
    else create.push(fila)
  }

  // Una cuenta es de una sola persona: hay un índice único que lo garantiza,
  // pero elegir la misma dos veces es un error de dedo, no un error de base, y
  // conviene decirlo antes de escribir nada.
  const cuentas = [...update, ...create].flatMap((row) => (row.player_id ? [row.player_id] : []))
  if (new Set(cuentas).size !== cuentas.length) {
    return { ok: false, error: 'Hay una misma cuenta elegida para dos inscriptos.' }
  }

  // Ver la regla 1: el formulario tiene que cubrir el plantel entero. Si le
  // falta una fila que existe, es un formulario viejo y no se aplica nada.
  if (vistos.size !== current.length) {
    return { ok: false, error: 'El plantel cambió mientras lo editabas. Recargá la página.' }
  }

  return { ok: true, remove, update, create }
}
