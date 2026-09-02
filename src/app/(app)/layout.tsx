import { redirect } from 'next/navigation'
import { getUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { Backdrop } from '@/components/layout/Backdrop'
import { SiteFooter } from '@/components/layout/SiteFooter'
import { SiteHeader, type NavLink } from '@/components/layout/SiteHeader'

/** The site's sections, in the order they are read. */
const LINKS: NavLink[] = [
  { href: '/estadisticas', label: 'Estadísticas' },
  { href: '/partidas', label: 'Partidas' },
  { href: '/equipos', label: 'Equipos' },
]

export default async function AppLayout({ children }: LayoutProps<'/'>) {
  // getUser and not requireUser: the site is visible without a session. What
  // the session changes is that the admin panel appears.
  const user = await getUser()

  async function signOut() {
    'use server'
    const supabase = await createClient()
    await supabase.auth.signOut()
    // To the home page and not to the login: without a session the site looks
    // the same, only without the panel. Sending people to the login on the way
    // out would imply one is needed.
    redirect('/')
  }

  const links = user ? [...LINKS, { href: '/admin', label: 'Panel' }] : LINKS

  return (
    <div className="flex min-h-screen flex-col">
      <Backdrop />

      <SiteHeader links={links} email={user?.email ?? null} signOut={signOut} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>

      {/* The wrapper is already flex-col with min-h-screen and the <main>
          carries flex-1, so the footer sits at the bottom even on a short
          page. */}
      <SiteFooter />
    </div>
  )
}
