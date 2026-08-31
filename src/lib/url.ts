/**
 * Armar links conservando los filtros que ya están puestos.
 *
 * Las páginas con más de un filtro —/estadisticas/tablas tiene fecha y grupo,
 * /partidas tiene fecha y equipo— tienen un problema chico y molesto: cada nav
 * arma su propio href, y si sólo pone el suyo, elegir la fecha 2 borra el grupo
 * que ya estaba elegido. Todos los navs pasan por acá para que eso no pase.
 */

/** `conQuery('/partidas', { fecha: 2, equipo: null })` -> `/partidas?fecha=2`. */
export function conQuery(
  base: string,
  params: Record<string, string | number | null | undefined>,
): string {
  const query = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    // Un parámetro vacío no es lo mismo que uno ausente para quien lee la URL,
    // y `?grupo=` no significa nada: se tira.
    if (value === null || value === undefined || value === '') continue
    query.set(key, String(value))
  }

  const qs = query.toString()
  return qs ? `${base}?${qs}` : base
}
