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
      // py-2 y no py-1: con `text-xs` el chip medía 26px de alto y es el
      // control que más se toca del sitio —fecha, grupo, vista y orden, en
      // cuatro páginas—. WCAG 2.5.8 pide 24 y la guía de iOS y Android 44;
      // así queda en 38, que entra en el renglón sin desarmar la fila.
      // shrink-0 y whitespace-nowrap: abajo de `sm` la barra que los contiene
      // scrollea en horizontal en vez de envolver, y sin esto los chips se
      // achican para entrar todos y el texto se parte en dos renglones.
      className={`shrink-0 whitespace-nowrap border-2 px-3 py-2 text-xs font-bold uppercase tracking-wide transition-colors ${
        active
          ? 'border-accent bg-accent-dim text-accent'
          : 'border-line text-muted hover:border-line-strong hover:text-accent'
      }`}
    >
      {label}
    </Link>
  )
}
