import { readFileSync } from 'node:fs'
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
  '0022_logo_script_path.sql',
  '0023_plantel_dinamico.sql',
  '0024_no_presentado.sql',
  '0025_kda_promedio.sql',
  '0026_minimo_una_partida.sql',
  '0027_meta_promedios.sql',
  '0028_desempate_directo.sql',
  '0029_roles_por_campeon.sql',
  '0030_estadisticas_por_rol.sql',
  '0031_alineacion_indebida.sql',
]

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
