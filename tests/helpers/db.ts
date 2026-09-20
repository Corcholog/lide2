import { readdirSync, readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

/**
 * Embedded Postgres (PGlite, WASM) that runs the real migrations, without
 * Docker or a Supabase project. Supabase provides some roles and the `auth` and
 * `storage` schemas; the minimum is stubbed here so migrations can reference
 * them.
 */
const SUPABASE_STUBS = `
create role anon;
create role authenticated;
create role service_role;

create schema if not exists auth;
create table auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text
);

create schema if not exists storage;
create table storage.buckets (
  id                 text primary key,
  name               text,
  public             boolean,
  file_size_limit    bigint,
  allowed_mime_types text[]
);
create table storage.objects (
  id        uuid primary key default gen_random_uuid(),
  bucket_id text,
  name      text
);
alter table storage.objects enable row level security;
`

/**
 * Every migration, in order, read from the directory rather than listed here.
 *
 * The list used to be written by hand, so a new migration was not applied until
 * someone remembered to add it: the suite went green while the change under
 * test had never run. The numeric prefixes make the file order the run order.
 */
export const MIGRATIONS = readdirSync('supabase/migrations')
  .filter((file) => file.endsWith('.sql'))
  .sort()

/**
 * Supabase's default table grants: `anon` and `authenticated` can SELECT
 * everything in `public`, and RLS decides what they see. Without this,
 * public-access tests would pass for the wrong reason (missing grants instead of
 * policies).
 */
const SUPABASE_GRANTS = `
grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
`

/**
 * The same for functions, applied before the migrations as a default privilege.
 *
 * Supabase grants execute when each function is created, which is why
 * migrations revoke it from `anon` and `authenticated` for write functions. A
 * `grant execute on all functions` run afterwards would undo those revokes;
 * with a default privilege the order matches production.
 */
const SUPABASE_DEFAULT_GRANTS = `
alter default privileges in schema public grant execute on functions to anon, authenticated;
`

export async function createTestDb(): Promise<PGlite> {
  const db = new PGlite()
  await db.exec(SUPABASE_STUBS)
  await db.exec(SUPABASE_DEFAULT_GRANTS)

  for (const file of MIGRATIONS) {
    await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'))
  }

  await db.exec(SUPABASE_GRANTS)

  return db
}

export async function columnsOf(db: PGlite, table: string): Promise<Set<string>> {
  const { rows } = await db.query<{ column_name: string }>(
    `select column_name from information_schema.columns
      where table_schema = 'public' and table_name = $1`,
    [table],
  )
  return new Set(rows.map((r) => r.column_name))
}
