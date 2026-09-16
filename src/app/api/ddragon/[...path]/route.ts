import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const DDRAGON = 'https://ddragon.leagueoflegends.com'
const ALLOWED = [
  /^cdn\/[\w.]+\/img\/(champion|item|spell|profileicon)\/[\w.'-]+\.png$/,
  // The loading screen art, which hangs off no version: see `championLoading`.
  /^cdn\/img\/champion\/loading\/\w+_\d+\.jpg$/,
]

/**
 * Same-origin proxy for Riot's assets.
 *
 * It serves two purposes: letting the Instagram card be exported to PNG without
 * the canvas being tainted by cross-origin images, and keeping the app from
 * depending on the CDN sending CORS headers.
 *
 * The JSON error messages stay in Spanish: they reach the upload panel.
 */
export async function GET(_request: Request, { params }: RouteContext<'/api/ddragon/[...path]'>) {
  const { path } = await params
  const relative = path.join('/')

  // Strict allowlist: this must never turn into an open proxy.
  if (!ALLOWED.some((pattern) => pattern.test(relative))) {
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
