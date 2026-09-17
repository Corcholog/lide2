-- ===========================================================================
-- Base schema: tournament, teams, players and matches parsed from .rofl files.
--
-- matches.raw_metadata and match_players.raw keep the full original JSON
-- (hundreds of fields per player). Only frequently queried stats are promoted to
-- columns; anything else can be read from `raw` without re-uploading.
-- ===========================================================================

-- --- Tournament ------------------------------------------------------------

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
  -- Stable identity across matches: the Riot ID can change, the PUUID does not.
  puuid           text not null unique,
  riot_game_name  text,
  riot_tag_line   text,
  -- Display name, if the team prefers an alias.
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

-- A player cannot be active twice on the same team.
create unique index team_members_active_key
  on public.team_members (team_id, player_id) where left_at is null;
create index team_members_player_idx on public.team_members (player_id) where left_at is null;

-- --- Bracket ---------------------------------------------------------------

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

-- --- Matches ---------------------------------------------------------------

create table public.matches (
  id             uuid primary key default gen_random_uuid(),
  tournament_id  uuid references public.tournaments(id) on delete set null,
  series_id      uuid references public.series(id) on delete set null,
  game_number    smallint,

  -- Free-text stage and round labels captured on upload, so matches can be
  -- grouped without stages/series rows (e.g. "Bloque B", "Fecha 1").
  stage_label    text,
  round_label    text,

  -- Only present when the file keeps the client's name
  -- ("LA2-1602356940.rofl"); teams often rename files.
  riot_match_id  text,
  -- The match's real identity: see src/lib/rofl/fingerprint.ts
  fingerprint    text not null unique,

  format         text not null,
  game_version   text,
  patch          text,
  game_length_ms integer not null,
  -- The .rofl has no date; it is estimated from the file's lastModified.
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

-- A match can have several .rofl files: each client records its own, so team
-- A's and team B's files are different bytes of the same match.
create table public.match_files (
  id                uuid primary key default gen_random_uuid(),
  match_id          uuid not null references public.matches(id) on delete cascade,
  storage_provider  text not null default 'supabase',
  storage_path      text not null,
  file_name         text not null,
  file_size         bigint not null,
  sha256            text unique,
  -- PUUID of the player whose client recorded the replay, when known.
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
  -- Filled once the player and their team exist in the tournament.
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
  -- Derived on ingest (minions + jungle). A real column, not a generated one, so
  -- ingest_match() can insert the whole row from the JSON.
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

  -- Some item ids exceed smallint (e.g. 223157), so integer is used.
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

-- A .rofl that fails to parse does not break the rest of the upload: it is
-- recorded here for a retry, and the original file stays in storage.
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
-- Read access for authenticated users (public access is opened in 0013).
-- Writes only happen through route handlers with the secret key, which bypasses
-- RLS: there are no insert/update/delete policies on purpose.

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
