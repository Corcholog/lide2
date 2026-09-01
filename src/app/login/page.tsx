import Link from 'next/link'
import { LoginForm } from '@/components/auth/LoginForm'

/*
 * Sin esto la pestaña mostraba el título por defecto del torneo entero, que en
 * una pantalla de entrada no dice nada. El template del layout raíz le agrega
 * el "· LIDE 2" atrás.
 */
export const metadata = { title: 'Entrar' }

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
        <h1 className="font-display text-3xl uppercase tracking-tight">LIDE</h1>
        <p className="mt-1 text-sm text-muted">Estadísticas del torneo</p>
      </div>
      <LoginForm next={next} />

      {/*
        Esta página está fuera del grupo (app), así que no hereda el layout: no
        tiene barra ni pie. Sin este link, quien cae acá por un link viejo o por
        equivocación sólo puede salir con el botón de atrás del navegador.
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
