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
  '0005_standings.sql',
  '0006_tournament.sql',
  '0007_fixture.sql',
  '0008_rosters.sql',
  '0009_fixture_detalle.sql',
  '0010_stats.sql',
  '0011_asignacion.sql',
  '0012_planteles.sql',
  '0013_publico.sql',
  '0014_plantel.sql',
  '0015_logos.sql',
  '0016_borrar_partida.sql',
  '0017_alta_de_cuenta.sql',
]

/**
 * Lo que hace Supabase por su cuenta: `anon` y `authenticated` tienen SELECT
 * sobre todo lo que hay en `public`, y lo que decide qué ve cada uno es el RLS,
 * no el GRANT.
 *
 * Sin esto los tests de acceso público darían un falso verde: `anon` no vería
 * nada, pero por falta de permiso de tabla y no por las policies, que es lo que
 * de verdad corre en producción.
 */
const SUPABASE_GRANTS = `
grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
grant execute on all functions in schema public to anon, authenticated;
`

export async function createTestDb(): Promise<PGlite> {
  const db = new PGlite()
  await db.exec(SUPABASE_STUBS)

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
