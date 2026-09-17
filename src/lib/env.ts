/**
 * Environment variables, with clear messages when one is missing.
 *
 * Supabase renamed the keys: new projects come with `publishable` and `secret`,
 * older ones with `anon` and `service_role`. Both names are accepted.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and fill in the values from the Supabase project.`,
    )
  }
  return value
}

export function supabaseUrl(): string {
  return required('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL)
}

/** Public key: sent to the browser; grants nothing beyond what RLS allows. */
export function supabasePublishableKey(): string {
  return required(
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  )
}

/** Secret key: bypasses RLS. Server only; never in a client component or a NEXT_PUBLIC_ variable. */
export function supabaseSecretKey(): string {
  return required(
    'SUPABASE_SECRET_KEY',
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY,
  )
}

export const REPLAYS_BUCKET = process.env.SUPABASE_REPLAYS_BUCKET ?? 'replays'

/**
 * The site's public origin, used to build absolute URLs for link previews
 * (Open Graph). Vercel provides it automatically; elsewhere set
 * NEXT_PUBLIC_SITE_URL. Falls back to localhost in development.
 */
export function siteUrl(): URL {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL
  if (explicit) return new URL(explicit)

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL
  if (vercel) return new URL(`https://${vercel}`)

  return new URL('http://localhost:3000')
}

/** Upload size limit (Supabase free plan); also checked in the browser before uploading. */
export const MAX_REPLAY_BYTES = 50 * 1024 * 1024
