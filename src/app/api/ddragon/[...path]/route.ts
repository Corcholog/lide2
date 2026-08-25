import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const DDRAGON = 'https://ddragon.leagueoflegends.com'
const ALLOWED = /^cdn\/[\w.]+\/img\/(champion|item|spell|profileicon)\/[\w.'-]+\.png$/

/**
 * Proxy same-origin de los assets de Riot.
 *
 * Sirve para dos cosas: que la card de Instagram se pueda exportar a PNG sin que
 * el canvas quede contaminado por imágenes cross-origin, y que la app no dependa
 * de que el CDN mande cabeceras CORS.
 */
export async function GET(_request: Request, { params }: RouteContext<'/api/ddragon/[...path]'>) {
  const { path } = await params
  const relative = path.join('/')

  // Lista blanca estricta: esto no puede convertirse en un proxy abierto.
  if (!ALLOWED.test(relative)) {
    return NextResponse.json({ error: 'Ruta no permitida' }, { status: 400 })
  }

  const upstream = await fetch(`${DDRAGON}/${relative}`, {
    next: { revalidate: 60 * 60 * 24 * 30 },
  })

  if (!upstream.ok) {
    return NextResponse.json({ error: 'Asset no encontrado' }, { status: upstream.status })
  }

  return new NextResponse(upstream.body, {
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'image/png',
      'Cache-Control': 'public, max-age=2592000, immutable',
    },
  })
}
