'use client'

/**
 * The last resort: the root layout failed.
 *
 * It replaces the whole document, so neither globals.css nor the fonts nor the
 * site's `data-theme` reach here. That is why everything is inline styles and
 * the dark theme's hex values written by hand: it is the one file in the
 * project where duplicating colours is right, because the tokens do not exist.
 *
 * It is almost never seen - the error.tsx inside catches everything that
 * happens in a page - but if something blows up earlier, this is the difference
 * between a screen of the tournament's and Next's raw error screen.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1.5rem',
          padding: '2rem',
          background: '#0a0a0b',
          color: '#e9e9ee',
          fontFamily: 'system-ui, sans-serif',
          textAlign: 'center',
        }}
      >
        <title>Algo se rompió · LIDE 2</title>

        <p style={{ margin: 0, fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.03em' }}>
          LIDE 2
        </p>
        <p style={{ margin: 0, maxWidth: '28rem', color: '#8f8f9c' }}>
          El sitio no pudo arrancar. Probá de nuevo en un momento.
        </p>

        <button
          type="button"
          onClick={retry}
          style={{
            cursor: 'pointer',
            border: 0,
            background: '#e11d2f',
            color: '#fff',
            padding: '0.6rem 1.2rem',
            fontSize: '0.85rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          Reintentar
        </button>

        {error.digest && (
          <p style={{ margin: 0, fontSize: '0.75rem', color: '#5a5a66' }}>
            código del error: {error.digest}
          </p>
        )}
      </body>
    </html>
  )
}
