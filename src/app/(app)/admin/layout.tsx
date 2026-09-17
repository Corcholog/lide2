import type { Metadata } from 'next'

/**
 * Keeps the panel out of search engines and link previews. Access control is
 * the proxy's and each page's job; this only avoids previews that look like
 * public pages.
 */
export const metadata: Metadata = {
  title: { default: 'Panel', template: '%s · Panel' },
  robots: { index: false, follow: false },
}

export default function AdminLayout({ children }: LayoutProps<'/admin'>) {
  return children
}
