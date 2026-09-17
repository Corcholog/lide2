import { redirect } from 'next/navigation'
import { getUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { Backdrop } from '@/components/layout/Backdrop'
import { SiteFooter } from '@/components/layout/SiteFooter'
import { SiteHeader, type NavLink } from '@/components/layout/SiteHeader'

/** The site's sections, in reading order. */
const LINKS: NavLink[] = [
  { href: '/estadisticas', label: 'Estadísticas' },
  { href: '/partidas', label: 'Partidas' },
  { href: '/equipos', label: 'Equipos' },
]

export default async function AppLayout({ children }: LayoutProps<'/'>) {
  // getUser, not requireUser: the site is public; a session only adds the panel.
  const user = await getUser()

  async function signOut() {
    'use server'
    const supabase = await createClient()
    await supabase.auth.signOut()
    // Back to the home page, not the login: the site does not require a session.
    redirect('/')
  }

  const links = user ? [...LINKS, { href: '/admin', label: 'Panel' }] : LINKS

  return (
    <div className="flex min-h-screen flex-col">
      <Backdrop />

      <SiteHeader links={links} email={user?.email ?? null} signOut={signOut} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>

      {/* The wrapper is a min-h-screen flex column with <main> as flex-1, so the
          footer stays at the bottom on short pages. */}
      <SiteFooter />
    </div>
  )
}
