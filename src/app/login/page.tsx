import Link from 'next/link'
import { LoginForm } from '@/components/auth/LoginForm'

/*
 * Without this the tab showed the whole tournament's default title, which says
 * nothing on a sign-in screen. The root layout's template appends the
 * "· LIDE 2" behind it.
 */
export const metadata = { title: 'Entrar' }

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const params = await searchParams

  /*
   * Where it returns to after signing in. It comes from the URL, so anybody can
   * write it: it has to be a route of this site and nothing else.
   *
   * Starting with "/" is not enough: "//othersite.com" starts that way too and
   * the browser reads it as an absolute URL with no protocol, which would send
   * somebody who just signed in to a foreign domain.
   */
  const raw = typeof params.next === 'string' ? params.next : null
  const next = raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/'

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-6">
      <div className="text-center">
        <h1 className="font-display text-3xl uppercase tracking-tight">LIDE</h1>
        <p className="mt-1 text-sm text-muted">Estadísticas del torneo</p>
      </div>
      <LoginForm next={next} />

      {/*
        This page sits outside the (app) group, so it does not inherit the
        layout: it has no bar and no footer. Without this link, whoever lands
        here through an old link or by mistake can only leave with the browser's
        back button.
      */}
      <Link
        href="/"
        className="text-xs text-muted underline underline-offset-2 transition-colors hover:text-accent"
      >
        ← Volver al torneo
      </Link>
    </main>
  )
}
