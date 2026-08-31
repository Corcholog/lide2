import { redirect } from 'next/navigation'
import { getUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { Backdrop } from '@/components/layout/Backdrop'
import { SiteFooter } from '@/components/layout/SiteFooter'
import { SiteHeader, type NavLink } from '@/components/layout/SiteHeader'

/** Las secciones del sitio, en el orden en que se leen. */
const LINKS: NavLink[] = [
  { href: '/estadisticas', label: 'Estadísticas' },
  { href: '/partidas', label: 'Partidas' },
  { href: '/equipos', label: 'Equipos' },
]

export default async function AppLayout({ children }: LayoutProps<'/'>) {
  // getUser y no requireUser: el sitio se ve sin sesión. Lo que cambia con la
  // sesión es que aparece el panel.
  const user = await getUser()

  async function signOut() {
    'use server'
    const supabase = await createClient()
    await supabase.auth.signOut()
    // A la home y no al login: sin sesión el sitio se ve igual, sólo que sin
    // el panel. Mandar al login al salir daría a entender que hace falta.
    redirect('/')
  }

  const links = user ? [...LINKS, { href: '/admin', label: 'Panel' }] : LINKS

  return (
    <div className="flex min-h-screen flex-col">
      <Backdrop />

      <SiteHeader links={links} email={user?.email ?? null} signOut={signOut} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>

      {/* El wrapper ya es flex-col con min-h-screen y el <main> lleva flex-1,
          asi que el pie queda abajo de todo aunque la pagina sea corta. */}
      <SiteFooter />
    </div>
  )
}
