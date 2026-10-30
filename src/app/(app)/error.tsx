'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { Button, buttonClass } from '@/components/ui/Button'

/**
 * Error screen for pages inside the site.
 *
 * "Reintentar" re-renders the server segment, which recovers from transient
 * failures. The `digest` is shown because in production the real message does
 * not reach the browser, and the digest is how to find it in the logs.
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
        <Button type="button" onClick={retry} shout>
          Reintentar
        </Button>
        <Link
          href="/"
          className={buttonClass({ variant: 'outline', shout: true })}
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
