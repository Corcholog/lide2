import type { Metadata } from 'next'

/**
 * The panel does not show up in search engines or in link previews.
 *
 * The proxy already protects it by asking for a session; this is so a panel URL
 * pasted into a chat does not generate a card with the tournament's title,
 * which would read as a public page.
 */
export const metadata: Metadata = {
  title: { default: 'Panel', template: '%s · Panel' },
  robots: { index: false, follow: false },
}

export default function AdminLayout({ children }: LayoutProps<'/admin'>) {
  return children
}
