import { LoginForm } from '@/components/auth/LoginForm'

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const params = await searchParams

  /*
   * A dónde vuelve después de entrar. Sale de la URL, así que lo puede escribir
   * cualquiera: tiene que ser una ruta de este sitio y nada más.
   *
   * No alcanza con que empiece en "/": "//otrositio.com" también empieza así y
   * el navegador lo lee como una URL absoluta sin protocolo, o sea que
   * mandaría a alguien recién logueado a un dominio ajeno.
   */
  const raw = typeof params.next === 'string' ? params.next : null
  const next = raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/'

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">LIDE</h1>
        <p className="mt-1 text-sm text-muted">Estadísticas del torneo</p>
      </div>
      <LoginForm next={next} />
    </main>
  )
}
