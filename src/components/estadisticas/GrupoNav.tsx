import { Chip } from '@/components/nav/Chip'
import { GRUPOS } from '@/lib/stats/tablas'
import { conQuery } from '@/lib/url'

/**
 * El selector de grupo de la pestaña Tablas.
 *
 * Se combina con el de fecha: los dos arrastran el filtro del otro, así que se
 * puede llegar a "Grupo B, fecha 2" eligiendo uno y después el otro, en el
 * orden que sea.
 */
export function GrupoNav({
  base,
  grupo,
  query = {},
}: {
  base: string
  /** La etiqueta guardada ("Grupo B"), o null si son todos. */
  grupo: string | null
  query?: Record<string, string | number | null | undefined>
}) {
  return (
    <nav aria-label="Grupo" className="flex flex-wrap gap-1">
      <Chip
        label="Todos"
        href={conQuery(base, { ...query, grupo: null })}
        active={grupo === null}
      />
      {GRUPOS.map((entry) => (
        <Chip
          key={entry.id}
          label={entry.label}
          href={conQuery(base, { ...query, grupo: entry.id })}
          active={grupo === entry.label}
        />
      ))}
    </nav>
  )
}
