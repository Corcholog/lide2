/**
 * El orden de una tabla ordenable por columna.
 *
 * Vive acá y no adentro del componente por dos motivos: es la parte que se
 * puede testear sin montar nada, y el orden viaja en la URL —así el link a
 * "campeones ordenados por banrate" se puede pegar en el grupo de WhatsApp y
 * abre lo mismo—, o sea que hay que parsearlo del lado del servidor y
 * aplicarlo del lado del cliente con el mismo código.
 */

export type Direccion = 'asc' | 'desc'

export interface Orden {
  /** El id de la columna, tal cual viaja en `?orden=`. */
  id: string
  dir: Direccion
}

/**
 * El orden pedido por la URL, o el default.
 *
 * Cae al default ante cualquier cosa rara: una columna que no existe, una
 * dirección inventada, el parámetro repetido. Una tabla que se dibuja ordenada
 * por algo distinto de lo que pidieron es molesta; una que no se dibuja es
 * peor.
 */
export function parseOrden(
  orden: string | string[] | undefined,
  dir: string | string[] | undefined,
  ordenables: readonly string[],
  fallback: Orden,
): Orden {
  const id = Array.isArray(orden) ? orden[0] : orden
  const direccion = Array.isArray(dir) ? dir[0] : dir

  if (!id || !ordenables.includes(id)) return fallback

  return { id, dir: direccion === 'asc' || direccion === 'desc' ? direccion : fallback.dir }
}

/**
 * Ordena sin tocar el arreglo original.
 *
 * Dos reglas que no son obvias:
 *
 * LOS NULL VAN SIEMPRE ÚLTIMOS, en las dos direcciones. Un campeón que nadie
 * jugó tiene el winrate en null, y ordenando ascendente por winrate no puede
 * encabezar la tabla: no es que gane el 0% de las veces, es que no se sabe. Es
 * el mismo criterio que `sortTeams` usa para los equipos que todavía no
 * jugaron (src/lib/teams/order.ts).
 *
 * SIEMPRE HAY DESEMPATE. Sin él, dos filas con el mismo valor quedan en el
 * orden en que las devolvió Postgres, que no está garantizado: la tabla baila
 * entre recargas y parece que se rompió algo.
 */
export function ordenar<T>(
  filas: T[],
  clave: (fila: T) => number | string | null,
  dir: Direccion,
  desempate: (a: T, b: T) => number,
): T[] {
  const signo = dir === 'asc' ? 1 : -1

  return [...filas].sort((a, b) => {
    const va = clave(a)
    const vb = clave(b)

    if (va === null || vb === null) {
      if (va === vb) return desempate(a, b)
      return va === null ? 1 : -1
    }

    const cmp =
      typeof va === 'string' || typeof vb === 'string'
        ? String(va).localeCompare(String(vb), 'es', { numeric: true, sensitivity: 'base' })
        : va - vb

    return cmp === 0 ? desempate(a, b) : cmp * signo
  })
}
