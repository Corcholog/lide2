/**
 * El filtro por equipo de /partidas.
 *
 * La fecha la parsea `parseScope` (src/lib/stats/scope.ts), que ya existe y es
 * el mismo recorte que usan /estadisticas y las cards. Acá sólo está el equipo.
 */

/**
 * `?equipo=<uuid>`, validado contra los equipos del torneo.
 *
 * Un id que no está en la lista se ignora en vez de filtrar por él: pegar un
 * uuid cualquiera devolvería una lista vacía, que se lee como "este equipo no
 * jugó nada" cuando en realidad ese equipo no existe.
 */
export function parseEquipo(
  value: string | string[] | undefined,
  equiposValidos: Iterable<string>,
): string | null {
  const id = Array.isArray(value) ? value[0] : value
  if (!id) return null

  return new Set(equiposValidos).has(id) ? id : null
}
