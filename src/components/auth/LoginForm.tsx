'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function LoginForm({ next }: { next: string }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      setError(
        authError.message === 'Invalid login credentials'
          ? 'Usuario o contraseña incorrectos'
          : authError.message,
      )
      setLoading(false)
      return
    }

    router.replace(next)
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-4">
      <label className="flex flex-col gap-2">
        <span className="text-sm text-ink-400">Email</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          className="rounded border border-ink-700 bg-ink-900 px-3 py-2 outline-none focus:border-brand-aqua"
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-sm text-ink-400">Contraseña</span>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          className="rounded border border-ink-700 bg-ink-900 px-3 py-2 outline-none focus:border-brand-aqua"
        />
      </label>

      {error && (
        <p className="rounded border border-brand-red/40 bg-brand-red-dim/40 px-3 py-2 text-sm text-brand-red-soft">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="rounded bg-brand-red px-4 py-2 font-medium text-white transition-colors hover:bg-brand-red-soft disabled:opacity-50"
      >
        {loading ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  )
}
