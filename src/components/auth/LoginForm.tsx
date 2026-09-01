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
        <span className="text-sm text-muted">Email</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          className="rounded border border-line-strong bg-surface px-3 py-2 focus:border-accent"
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-sm text-muted">Contraseña</span>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          className="rounded border border-line-strong bg-surface px-3 py-2 focus:border-accent"
        />
      </label>

      {/*
        role="alert" porque el formulario no recarga la página: sin esto, un
        lector de pantalla no se entera de que apareció el mensaje y la persona
        se queda esperando sin saber que la contraseña estaba mal.
      */}
      {error && (
        <p
          role="alert"
          className="rounded border border-danger/40 bg-danger-dim px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="rounded bg-accent-strong px-4 py-2 font-medium text-white transition-colors hover:bg-accent disabled:opacity-50"
      >
        {loading ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  )
}
