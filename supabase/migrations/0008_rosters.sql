-- LIDE 2: planteles inscriptos
--
-- Los 113 nombres de las planillas de inscripcion. NO van en `players`: esa
-- tabla son cuentas de Riot detectadas de los replays, con su puuid, y un
-- inscripto no tiene cuenta asociada hasta que alguien las empareje a mano desde
-- el panel. Son dos listas distintas de la misma gente y se cruzan por player_id
-- cuando se puede.
--
--   +---------------+                 +----------+
--   | team_roster   |  player_id -->  | players  |
--   | nombre y      |                 | cuenta   |
--   | universidad   |                 | de Riot  |
--   | de la planilla|                 | del rofl |
--   +---------------+                 +----------+
--
-- PRIVACIDAD: son nombres legales de personas reales, sacados de un formulario
-- de inscripcion, no apodos elegidos. La policy de abajo es `to authenticated` a
-- proposito y tiene que quedarse asi: cuando el sitio se abra al publico y las
-- demas tablas sumen `anon`, ESTA NO. Lo que se muestra sin sesion es el equipo,
-- la universidad y las cuentas de Riot que ya aparecen en las partidas.

create table public.team_roster (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null references public.teams(id) on delete cascade,

  -- Tal cual figura en la planilla, sin corregir. La planilla mezcla formatos
  -- ("Apellido, Nombre", "Apellido Nombre", mayusculas) y darlos vuelta a ojo es
  -- una forma barata de escribirle mal el nombre a alguien.
  full_name     text not null,
  -- Como mostrarlo, si alguien lo dejo prolijo desde el panel. Null = usar
  -- full_name.
  display_name  text,

  university_id uuid references public.universities(id) on delete set null,
  -- Orden en que figura en la planilla.
  order_index   smallint not null default 0,

  -- La cuenta de Riot de esta persona, cuando se la empareje.
  player_id     uuid references public.players(id) on delete set null,

  created_at    timestamptz not null default now(),

  unique (team_id, order_index)
);

create index team_roster_team_idx       on public.team_roster (team_id);
create index team_roster_university_idx on public.team_roster (university_id);

-- Una cuenta de Riot no puede ser dos inscriptos distintos.
create unique index team_roster_player_key
  on public.team_roster (player_id)
  where player_id is not null;

comment on table public.team_roster is
  'Inscriptos de cada equipo, de las planillas de la organizacion. Solo lectura autenticada: son nombres legales, no apodos.';

alter table public.team_roster enable row level security;

-- Ver el comentario de privacidad arriba antes de tocar esto.
create policy "lectura autenticada" on public.team_roster
  for select to authenticated using (true);
