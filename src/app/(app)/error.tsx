'use client'

import Link from 'next/link'
import { useEffect } from 'react'

/**
 * When a page of the site breaks.
 *
 * Before this, an exception in any query showed Next's raw error screen, stack
 * and all. On the day of the first matchday, with people watching, that is the
 * worst thing that can happen.
 *
 * The button says "reintentar" and it really does retry: `retry()` re-renders
 * the server segment, so if what failed was a load spike or a Supabase timeout,
 * it fixes itself from the same place.
 *
 * `digest` is the identifier Next attaches to the error on the server: in
 * production the real message never travels to the browser, and that code is
 * the only thing that makes it findable in the logs. Hence it is shown.
 */
export default function ErrorBoundary({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex flex-col items-center gap-6 border-2 border-line bg-surface px-6 py-16 text-center">
      <div>
        <p className="font-display text-2xl uppercase tracking-tight">Algo se rompió</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          No se pudo cargar esta página. Suele ser un problema momentáneo con la base.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={retry}
          className="cursor-pointer bg-accent-strong px-4 py-2 text-sm font-bold uppercase tracking-wide text-white transition-colors hover:bg-accent"
        >
          Reintentar
        </button>
        <Link
          href="/"
          className="border-2 border-line-strong px-4 py-2 text-sm font-bold uppercase tracking-wide text-muted transition-colors hover:border-accent hover:text-accent"
        >
          Ir al inicio
        </Link>
      </div>

      {error.digest && (
        <p className="font-mono text-xs text-dim">
          código del error: {error.digest}
        </p>
      )}
    </div>
  )
}
