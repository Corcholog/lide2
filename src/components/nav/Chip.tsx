import Link from 'next/link'

/**
 * El chip de los filtros del sitio.
 *
 * El markup estaba repetido en `ScopeNav` y `OrdenEquipos`; con la pestaña de
 * tablas pasaban a ser cuatro copias de lo mismo, que ya es una de más para que
 * sigan pareciéndose entre sí sin que nadie se acuerde de tocar las cuatro.
 *
 * Es un `<Link>` y no un botón porque el filtro viaja en la URL: la página
 * sigue siendo un componente de servidor, el recorte se puede compartir pegando
 * el link y anda sin JavaScript.
 */
export function Chip({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'true' : undefined}
      className={`border-2 px-3 py-1 text-xs font-bold uppercase tracking-wide transition-colors ${
        active
          ? 'border-accent bg-accent-dim text-accent'
          : 'border-line text-muted hover:border-line-strong hover:text-accent'
      }`}
    >
      {label}
    </Link>
  )
}
