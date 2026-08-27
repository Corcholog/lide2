import type { Metadata } from 'next'

/**
 * El panel no sale en buscadores ni en las vistas previas de los links.
 *
 * El proxy ya lo protege pidiendo sesión; esto es para que una URL del panel
 * pegada en un chat no genere una tarjeta con el título del torneo, que
 * confundiría con una página pública.
 */
export const metadata: Metadata = {
  title: { default: 'Panel', template: '%s · Panel' },
  robots: { index: false, follow: false },
}

export default function AdminLayout({ children }: LayoutProps<'/admin'>) {
  return children
}
