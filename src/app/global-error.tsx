'use client'

/**
 * El último recurso: falló el layout raíz.
 *
 * Reemplaza el documento entero, así que no llegan acá ni globals.css ni las
 * fuentes ni el `data-theme` del sitio. Por eso todo va en estilos inline y en
 * los hexadecimales del tema oscuro escritos a mano: es el único archivo del
 * proyecto donde duplicar colores es correcto, porque los tokens no existen.
 *
 * Casi nunca se ve —el error.tsx de adentro atrapa todo lo que pasa en una
 * página— pero si algo revienta antes, esto es la diferencia entre una pantalla
 * del torneo y la pantalla de error cruda de Next.
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
