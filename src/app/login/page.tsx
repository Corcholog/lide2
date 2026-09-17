import Link from 'next/link'
import { LoginForm } from '@/components/auth/LoginForm'

// The layout's title template adds "· LIDE 2".
export const metadata = { title: 'Entrar' }

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const params = await searchParams

  /*
    Where to go after signing in. It comes from the URL, so it must be a path
    on this site: starting with "/" is not enough, since "//othersite.com" is a
    protocol-relative URL to another domain.
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
        /login is outside the (app) group, so it has no header or footer; this
        link is the way back to the site.
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
