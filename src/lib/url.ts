/**
 * Building links while keeping the filters that are already set.
 *
 * Pages with more than one filter — /estadisticas/tablas has matchday and
 * group, /partidas has matchday and team — have a small, annoying problem:
 * every nav builds its own href, and if it only puts its own parameter in,
 * picking matchday 2 wipes the group that was already selected. Every nav goes
 * through here so that cannot happen.
 *
 * The parameter names themselves stay in Spanish: they are part of the links
 * people paste around.
 */

/** `withQuery('/partidas', { fecha: 2, equipo: null })` -> `/partidas?fecha=2`. */
export function withQuery(
  base: string,
  params: Record<string, string | number | null | undefined>,
): string {
  const query = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    // An empty parameter is not the same as an absent one to whoever reads the
    // URL, and `?grupo=` means nothing: it gets dropped.
    if (value === null || value === undefined || value === '') continue
    query.set(key, String(value))
  }

  const qs = query.toString()
  return qs ? `${base}?${qs}` : base
}
