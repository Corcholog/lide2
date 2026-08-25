-- ===========================================================================
-- Esquema base: torneo, equipos, jugadores y partidas extraidas de los .rofl
--
-- Regla de oro: matches.raw_metadata y match_players.raw guardan el JSON
-- original completo (365 campos por jugador en el parche 16.12). Las columnas
-- promovidas son solo las que se consultan seguido; cualquier stat que no este
-- como columna sale de `raw` sin tener que volver a subir nada.
-- ===========================================================================

-- --- Torneo ----------------------------------------------------------------

create table public.tournaments (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  format      text,
  starts_at   date,
  ends_at     date,
  created_at  timestamptz not null default now()
);

create table public.teams (
  id             uuid primary key default gen_random_uuid(),
  tournament_id  uuid references public.tournaments(id) on delete cascade,
  name           text not null,
  tag            text,
  logo_url       text,
  seed           smallint,
  created_at     timestamptz not null default now()
);

create unique index teams_name_key on public.teams (tournament_id, lower(name));

create table public.players (
  id              uuid primary key default gen_random_uuid(),
  -- Identidad estable entre partidas: el Riot ID cambia, el PUUID no.
  puuid           text not null unique,
  riot_game_name  text,
  riot_tag_line   text,
  -- Nombre para mostrar si el equipo prefiere otro alias.
  display_name    text,
  created_at      timestamptz not null default now(),
  last_seen_at    timestamptz
);

create table public.team_members (
  id             uuid primary key default gen_random_uuid(),
  team_id        uuid not null references public.teams(id) on delete cascade,
  player_id      uuid not null references public.players(id) on delete cascade,
  role           text,
  is_substitute  boolean not null default false,
  joined_at      timestamptz not null default now(),
  left_at        timestamptz
);

-- Un jugador no puede estar dos veces activo en el mismo equipo.
create unique index team_members_active_key
  on public.team_members (team_id, player_id) where left_at is null;
create index team_members_player_idx on public.team_members (player_id) where left_at is null;

-- --- Bracket (creado para la expansion; sin UI en el MVP) -------------------

create table public.stages (
  id             uuid primary key default gen_random_uuid(),
  tournament_id  uuid not null references public.tournaments(id) on delete cascade,
  name           text not null,
  kind           text,
  order_index    smallint not null default 0
);

create table public.series (
  id                 uuid primary key default gen_random_uuid(),
  stage_id           uuid references public.stages(id) on delete cascade,
  round              text,
  team_a_id          uuid references public.teams(id) on delete set null,
  team_b_id          uuid references public.teams(id) on delete set null,
  best_of            smallint not null default 1,
  scheduled_at       timestamptz,
  status             text not null default 'pending',
  winner_team_id     uuid references public.teams(id) on delete set null,
  battlefy_match_id  text
);

-- --- Partidas --------------------------------------------------------------

create table public.matches (
  id             uuid primary key default gen_random_uuid(),
  tournament_id  uuid references public.tournaments(id) on delete set null,
  series_id      uuid references public.series(id) on delete set null,
  game_number    smallint,

  -- El torneo corre en formato suizo (20 equipos). Estas dos etiquetas se
  -- capturan al subir para poder agrupar sin depender todavia de stages/series:
  --   stage_label: "Suizo", "Playoffs"
  --   round_label: "Ronda 3"
  stage_label    text,
  round_label    text,

  -- Solo aparece cuando el archivo conserva el nombre del cliente
  -- ("LA2-1602356940.rofl"); los equipos suelen renombrarlos.
  riot_match_id  text,
  -- Identidad real de la partida: ver src/lib/rofl/fingerprint.ts
  fingerprint    text not null unique,

  format         text not null,
  game_version   text,
  patch          text,
  game_length_ms integer not null,
  -- El .rofl no guarda la fecha; se estima con el lastModified del archivo.
  played_at      timestamptz,

  winning_side              smallint check (winning_side in (100, 200)),
  blue_team_id              uuid references public.teams(id) on delete set null,
  red_team_id               uuid references public.teams(id) on delete set null,
  ended_in_surrender        boolean not null default false,
  ended_in_early_surrender  boolean not null default false,

  raw_metadata   jsonb not null,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index matches_played_at_idx on public.matches (played_at desc nulls last);
create index matches_patch_idx on public.matches (patch);
create unique index matches_riot_match_id_key
  on public.matches (riot_match_id) where riot_match_id is not null;

-- Un mismo partido puede tener varios .rofl: cada cliente graba el suyo, asi que
-- el archivo del equipo A y el del B son bytes distintos de la misma partida.
create table public.match_files (
  id                uuid primary key default gen_random_uuid(),
  match_id          uuid not null references public.matches(id) on delete cascade,
  storage_provider  text not null default 'supabase',
  storage_path      text not null,
  file_name         text not null,
  file_size         bigint not null,
  sha256            text unique,
  -- PUUID del jugador cuyo cliente grabo el replay, si se puede determinar.
  client_puuid      text,
  uploaded_by       uuid references auth.users(id) on delete set null,
  uploaded_at       timestamptz not null default now()
);

create index match_files_match_idx on public.match_files (match_id);

create table public.match_players (
  id                 uuid primary key default gen_random_uuid(),
  match_id           uuid not null references public.matches(id) on delete cascade,
  side               smallint not null check (side in (100, 200)),
  participant_index  smallint not null,

  puuid              text not null,
  -- Se completan cuando el jugador y su equipo existen en el torneo.
  player_id          uuid references public.players(id) on delete set null,
  team_id            uuid references public.teams(id) on delete set null,
  riot_game_name     text,
  riot_tag_line      text,
  summoner_name      text,

  champion           text not null,
  position           text,
  win                boolean not null,

  kills              integer not null default 0,
  deaths             integer not null default 0,
  assists            integer not null default 0,
  champion_level     integer not null default 0,
  exp                integer not null default 0,

  gold_earned            integer not null default 0,
  gold_spent             integer not null default 0,
  minions_killed         integer not null default 0,
  neutral_minions_killed integer not null default 0,
  -- Derivado en el ingest (minions + jungla). Columna real y no generada para
  -- que ingest_match() pueda insertar la fila entera desde el JSON de una.
  cs                     integer not null default 0,

  damage_to_champions            integer not null default 0,
  physical_damage_to_champions   integer not null default 0,
  magic_damage_to_champions      integer not null default 0,
  true_damage_to_champions       integer not null default 0,
  damage_taken                   integer not null default 0,
  damage_taken_from_champions    integer not null default 0,
  damage_mitigated               integer not null default 0,
  damage_to_turrets              integer not null default 0,
  damage_to_objectives           integer not null default 0,
  total_heal                     integer not null default 0,
  heal_on_teammates              integer not null default 0,
  shielded_on_teammates          integer not null default 0,

  vision_score           integer not null default 0,
  wards_placed           integer not null default 0,
  wards_killed           integer not null default 0,
  detector_wards_placed  integer not null default 0,
  control_wards_bought   integer not null default 0,

  turret_takedowns     integer not null default 0,
  inhibitor_takedowns  integer not null default 0,
  dragon_kills         integer not null default 0,
  baron_kills          integer not null default 0,
  herald_kills         integer not null default 0,
  atakhan_kills        integer not null default 0,
  void_grub_kills      integer not null default 0,
  objectives_stolen    integer not null default 0,

  largest_killing_spree  integer not null default 0,
  largest_multi_kill     integer not null default 0,
  double_kills           integer not null default 0,
  triple_kills           integer not null default 0,
  quadra_kills           integer not null default 0,
  penta_kills            integer not null default 0,

  time_ccing_others     integer not null default 0,
  total_time_spent_dead integer not null default 0,
  longest_time_living   integer not null default 0,
  time_played           integer not null default 0,

  -- Los items de Ornn pasan el rango de smallint (ej. 223157), van como integer.
  items              integer[] not null default '{}',
  summoner_spell_1   text,
  summoner_spell_2   text,
  keystone_id        integer not null default 0,
  perk_primary_style integer not null default 0,
  perk_sub_style     integer not null default 0,

  was_afk     boolean not null default false,
  was_leaver  boolean not null default false,
  avg_ping    integer not null default 0,

  raw jsonb not null,

  unique (match_id, puuid)
);

create index match_players_match_idx on public.match_players (match_id);
create index match_players_puuid_idx on public.match_players (puuid);
create index match_players_player_idx on public.match_players (player_id);
create index match_players_team_idx on public.match_players (team_id);
create index match_players_champion_idx on public.match_players (champion);

-- Un .rofl que no se pudo parsear no rompe la subida del resto: queda aca para
-- reintentar, y el archivo original sigue en el storage.
create table public.ingest_failures (
  id             uuid primary key default gen_random_uuid(),
  file_name      text not null,
  storage_path   text,
  error_code     text not null,
  error_message  text not null,
  details        jsonb,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now()
);

-- --- RLS -------------------------------------------------------------------
-- Por ahora todo el sitio esta detras del login, asi que alcanza con lectura
-- para usuarios autenticados. Para abrirlo al publico mas adelante: cambiar
-- `to authenticated` por `to anon, authenticated` en las tablas de lectura.
-- Las escrituras van solo por los route handlers con la service key, que se
-- saltea RLS: no hay politicas de insert/update/delete a proposito.

alter table public.tournaments     enable row level security;
alter table public.teams           enable row level security;
alter table public.players         enable row level security;
alter table public.team_members    enable row level security;
alter table public.stages          enable row level security;
alter table public.series          enable row level security;
alter table public.matches         enable row level security;
alter table public.match_files     enable row level security;
alter table public.match_players   enable row level security;
alter table public.ingest_failures enable row level security;

create policy "lectura autenticada" on public.tournaments     for select to authenticated using (true);
create policy "lectura autenticada" on public.teams           for select to authenticated using (true);
create policy "lectura autenticada" on public.players         for select to authenticated using (true);
create policy "lectura autenticada" on public.team_members    for select to authenticated using (true);
create policy "lectura autenticada" on public.stages          for select to authenticated using (true);
create policy "lectura autenticada" on public.series          for select to authenticated using (true);
create policy "lectura autenticada" on public.matches         for select to authenticated using (true);
create policy "lectura autenticada" on public.match_files     for select to authenticated using (true);
create policy "lectura autenticada" on public.match_players   for select to authenticated using (true);
create policy "lectura autenticada" on public.ingest_failures for select to authenticated using (true);
