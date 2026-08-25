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

/** Techo del plan free de Supabase; tambien se valida en el browser antes de subir. */
export const MAX_REPLAY_BYTES = 50 * 1024 * 1024
