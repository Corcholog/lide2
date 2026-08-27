import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { Backdrop } from '@/components/layout/Backdrop'
import { ThemeToggle } from '@/components/theme/ThemeToggle'

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

  return (
    <div className="flex min-h-screen flex-col">
      <Backdrop />

      {/*
        Alto declarado, no el del contenido: la portada del torneo se mide
        contra él para terminar exactamente en el pliegue. Ver --site-header en
        globals.css.
      */}
      <header className="h-[var(--site-header)] border-b-2 border-line bg-surface/85 backdrop-blur">
        <div className="mx-auto flex h-full w-full max-w-6xl items-center gap-6 px-6">
          <Link href="/" className="font-display text-xl font-bold uppercase tracking-wide">
            LIDE
          </Link>
          {/*
            Sin link a "Torneo": la home ES el torneo, y el logo de la izquierda
            ya lleva ahí. Un item de nav que apunta a la página donde ya estás es
            una invitación a hacer clic para nada.
          */}
          <nav className="flex flex-1 gap-4 text-sm">
            <Link href="/estadisticas" className="text-fg-soft transition-colors hover:text-accent">
              Estadísticas
            </Link>
            <Link href="/partidas" className="text-fg-soft transition-colors hover:text-accent">
              Partidas
            </Link>
            <Link href="/equipos" className="text-fg-soft transition-colors hover:text-accent">
              Equipos
            </Link>
            <Link href="/jugadores" className="text-fg-soft transition-colors hover:text-accent">
              Jugadores
            </Link>
            {user && (
              <Link href="/admin" className="text-fg-soft transition-colors hover:text-accent">
                Panel
              </Link>
            )}
          </nav>
          <ThemeToggle />
          {user ? (
            <>
              <span className="hidden text-xs text-faint sm:inline">{user.email}</span>
              <form action={signOut}>
                <button
                  type="submit"
                  className="text-xs text-muted transition-colors hover:text-accent"
                >
                  Salir
                </button>
              </form>
            </>
          ) : (
            <Link href="/login" className="text-xs text-muted transition-colors hover:text-accent">
              Entrar
            </Link>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
    </div>
  )
}
