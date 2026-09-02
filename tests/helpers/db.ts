import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

/**
 * Embedded Postgres (WASM) for running the real migrations in the tests,
 * without Docker or a Supabase project.
 *
 * Supabase ships the roles and the `auth` and `storage` schemas out of the box;
 * here the minimum has to be created so the migrations can reference them.
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
  '0018_tag_a_la_vista.sql',
  '0019_asignar_cuenta.sql',
  '0020_asignar_posicion.sql',
  '0021_meta_y_bans.sql',
]

/**
 * What Supabase does on its own: `anon` and `authenticated` hold SELECT over
 * everything in `public`, and what decides who sees what is RLS, not the GRANT.
 *
 * Without this the public-access tests would give a false green: `anon` would
 * see nothing, but for want of a table permission and not because of the
 * policies, which are what actually runs in production.
 */
const SUPABASE_GRANTS = `
grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
`

/**
 * The same for the functions, but BEFORE the migrations and as a default
 * privilege.
 *
 * Supabase grants it to each function at the moment it is created, which is why
 * the migrations that create writing functions end with a `revoke execute ...
 * from anon, authenticated`. A `grant execute on all functions` run afterwards
 * would trample every one of those revokes, and the tests would claim anybody
 * can call `set_match_bans` or `assign_team_member_role` - or worse, would
 * claim nobody can while production says otherwise. With the default privilege
 * the order is the real one: the grant first, each migration's revoke after.
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
