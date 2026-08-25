import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export default async function AppLayout({ children }: LayoutProps<'/'>) {
  const user = await requireUser()

  async function signOut() {
    'use server'
    const supabase = await createClient()
    await supabase.auth.signOut()
    redirect('/login')
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-ink-800">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-6 px-6 py-4">
          <Link href="/" className="text-lg font-bold tracking-tight">
            LIDE
          </Link>
          <nav className="flex flex-1 gap-4 text-sm">
            <Link href="/" className="text-ink-300 transition-colors hover:text-white">
              Partidas
            </Link>
            <Link href="/admin/upload" className="text-ink-300 transition-colors hover:text-white">
              Subir replays
            </Link>
          </nav>
          <span className="hidden text-xs text-ink-500 sm:inline">{user.email}</span>
          <form action={signOut}>
            <button type="submit" className="text-xs text-ink-400 transition-colors hover:text-brand-red-soft">
              Salir
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
    </div>
  )
}
