-- LIDE 2: signup rosters
--
-- The names from the signup sheets. They do NOT go in `players`, which holds Riot
-- accounts detected from replays. A signup has no account until an admin links
-- them; the two lists are joined through player_id.
--
--   +---------------+                 +----------+
--   | team_roster   |  player_id -->  | players  |
--   | name and      |                 | Riot     |
--   | university    |                 | account  |
--   | from the sheet|                 | from rofl|
--   +---------------+                 +----------+
--
-- PRIVACY: these are real people's legal names from a signup form. The policy
-- below is `to authenticated` on purpose and must stay that way, even when
-- other tables are opened to `anon`.

create table public.team_roster (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null references public.teams(id) on delete cascade,

  -- As written on the sheet, uncorrected: formats are mixed ("Surname, Name",
  -- all caps), and reordering them by guess risks misspelling someone's name.
  full_name     text not null,
  -- Display form, if tidied up from the panel. Null means use full_name.
  display_name  text,

  university_id uuid references public.universities(id) on delete set null,
  -- Order on the sheet.
  order_index   smallint not null default 0,

  -- This person's Riot account, once linked.
  player_id     uuid references public.players(id) on delete set null,

  created_at    timestamptz not null default now(),

  unique (team_id, order_index)
);

create index team_roster_team_idx       on public.team_roster (team_id);
create index team_roster_university_idx on public.team_roster (university_id);

-- A Riot account cannot belong to two signups.
create unique index team_roster_player_key
  on public.team_roster (player_id)
  where player_id is not null;

comment on table public.team_roster is
  'Inscriptos de cada equipo, de las planillas de la organizacion. Solo lectura autenticada: son nombres legales, no apodos.';

alter table public.team_roster enable row level security;

-- Read the privacy note above before changing this.
create policy "lectura autenticada" on public.team_roster
  for select to authenticated using (true);
