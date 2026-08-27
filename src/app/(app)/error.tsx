'use client'

import Link from 'next/link'
import { useEffect } from 'react'

/**
 * Cuando una página del sitio se rompe.
 *
 * Antes de esto, una excepción en cualquier consulta mostraba la pantalla de
 * error cruda de Next, con el stack. El día de la primera fecha, con gente
 * mirando, eso es lo peor que puede pasar.
 *
 * El botón dice "reintentar" y de verdad reintenta: `retry()` vuelve a
 * renderizar el segmento del servidor, así que si lo que falló fue un pico de
 * carga o un timeout de Supabase, se arregla solo desde el mismo lugar.
 *
 * `digest` es el identificador que Next le pone al error en el servidor: en
 * producción el mensaje real no viaja al browser, y ese código es lo único que
 * permite encontrarlo en los logs. Por eso se muestra.
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
