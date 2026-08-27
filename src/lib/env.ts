/**
 * Variables de entorno, con mensajes claros cuando falta alguna.
 *
 * Supabase renombro las claves: los proyectos nuevos traen `publishable` y
 * `secret`, los viejos `anon` y `service_role`. Se aceptan los dos nombres.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Falta la variable de entorno ${name}. Copiá .env.example a .env.local y completá los valores del proyecto de Supabase.`,
    )
  }
  return value
}

export function supabaseUrl(): string {
  return required('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL)
}

/** Clave publica: viaja al browser, no da acceso a nada sin sesion + RLS. */
export function supabasePublishableKey(): string {
  return required(
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  )
}

/**
 * Clave secreta: se saltea RLS. Solo del lado del servidor, nunca en un
 * componente cliente ni en una variable NEXT_PUBLIC_.
 */
export function supabaseSecretKey(): string {
  return required(
    'SUPABASE_SECRET_KEY',
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY,
  )
}

export const REPLAYS_BUCKET = process.env.SUPABASE_REPLAYS_BUCKET ?? 'replays'

/**
 * De dónde cuelga el sitio. Sirve para una sola cosa, pero importante: resolver
 * las URLs absolutas de las tarjetas que arma WhatsApp, Discord y Twitter
 * cuando alguien pega el link. Con una URL relativa no hay vista previa.
 *
 * Vercel la expone sola; en otro lado se pone a mano. El default de desarrollo
 * no sirve para compartir nada, pero deja el sitio andando sin configurarla.
 */
export function siteUrl(): URL {
  const explicita = process.env.NEXT_PUBLIC_SITE_URL
  if (explicita) return new URL(explicita)

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL
  if (vercel) return new URL(`https://${vercel}`)

  return new URL('http://localhost:3000')
}

/** Techo del plan free de Supabase; tambien se valida en el browser antes de subir. */
export const MAX_REPLAY_BYTES = 50 * 1024 * 1024
