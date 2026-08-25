import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

/**
 * Postgres embebido (WASM) para correr las migraciones de verdad en los tests,
 * sin Docker ni un proyecto de Supabase.
 *
 * Supabase trae de fabrica los roles y los esquemas `auth` y `storage`; aca hay
 * que crear lo minimo para que las migraciones puedan referenciarlos.
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

export const MIGRATIONS = [
  '0001_init.sql',
  '0002_views.sql',
  '0003_ingest_match.sql',
  '0004_storage.sql',
]

export async function createTestDb(): Promise<PGlite> {
  const db = new PGlite()
  await db.exec(SUPABASE_STUBS)

  for (const file of MIGRATIONS) {
    await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'))
  }

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
