import { LoginForm } from '@/components/auth/LoginForm'

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const params = await searchParams
  const next = typeof params.next === 'string' && params.next.startsWith('/') ? params.next : '/'

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">LIDE</h1>
        <p className="mt-1 text-sm text-ink-400">Estadísticas del torneo</p>
      </div>
      <LoginForm next={next} />
    </main>
  )
}
