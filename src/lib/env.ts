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

/** Public key: it travels to the browser and unlocks nothing without a session + RLS. */
export function supabasePublishableKey(): string {
  return required(
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  )
}

/**
 * Secret key: it bypasses RLS. Server side only, never in a client component
 * nor in a NEXT_PUBLIC_ variable.
 */
export function supabaseSecretKey(): string {
  return required(
    'SUPABASE_SECRET_KEY',
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY,
  )
}

export const REPLAYS_BUCKET = process.env.SUPABASE_REPLAYS_BUCKET ?? 'replays'

/**
 * Where the site hangs from. It serves one purpose, but an important one:
 * resolving the absolute URLs of the preview cards WhatsApp, Discord and
 * Twitter build when somebody pastes the link. With a relative URL there is no
 * preview at all.
 *
 * Vercel exposes it on its own; anywhere else it is set by hand. The
 * development default is no good for sharing anything, but it keeps the site
 * running without configuring it.
 */
export function siteUrl(): URL {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL
  if (explicit) return new URL(explicit)

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL
  if (vercel) return new URL(`https://${vercel}`)

  return new URL('http://localhost:3000')
}

/** Ceiling of the Supabase free plan; also validated in the browser before uploading. */
export const MAX_REPLAY_BYTES = 50 * 1024 * 1024
