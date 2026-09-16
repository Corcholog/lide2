/**
 * Link building that keeps the filters already set.
 *
 * Pages with several filters (matchday and group on /estadisticas/tablas,
 * matchday and team on /partidas) build each nav's href here, so picking one
 * filter does not clear the others. Parameter names stay in Spanish because
 * they are part of shared links.
 */

/** The first value of a search param: `?a=1&a=2` reads as "1". */
export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/** `withQuery('/partidas', { fecha: 2, equipo: null })` -> `/partidas?fecha=2`. */
export function withQuery(
  base: string,
  params: Record<string, string | number | null | undefined>,
): string {
  const query = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    // `?grupo=` means nothing, so empty values are dropped like absent ones.
    if (value === null || value === undefined || value === '') continue
    query.set(key, String(value))
  }

  const qs = query.toString()
  return qs ? `${base}?${qs}` : base
}
