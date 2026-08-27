-- LIDE 2: universidades por equipo y fixture publicado
--
-- Dos cosas que aparecieron cuando la organizacion mando las planillas:
--
-- 1. Cuatro equipos (13, 15, 16 y 17) salieron de inscripciones individuales y
--    mezclan hasta tres universidades. teams.university_id, que es una sola,
--    no alcanza para nombrarlos: la planilla los lista como "UAP/UNER" o
--    "UNLu/UNAM/UNCUYO". La columna se queda como la universidad mas
--    representada (sirve para atribuir en las estadisticas por universidad) y
--    la lista completa vive en team_universities.
--
-- 2. El fixture completo de la fase de grupos ya esta publicado: 40 partidos en
--    5 turnos. Un cruce existe desde que se publica el calendario, mucho antes
--    de que haya un .rofl, asi que no puede vivir en `matches`, que sale de los
--    replays. Va en su propia tabla y se le engancha la partida cuando aparece.

-- --- Universidades por equipo -----------------------------------------------

create table public.team_universities (
  team_id       uuid     not null references public.teams(id)        on delete cascade,
  university_id uuid     not null references public.universities(id) on delete cascade,
  -- La mas representada primero, que es como las lista la organizacion.
  order_index   smallint not null default 0,
  primary key (team_id, university_id)
);

create index team_universities_university_idx on public.team_universities (university_id);

comment on table public.team_universities is
  'Universidades que representa cada equipo. La mayoria tiene una sola; los equipos armados con inscripciones individuales tienen varias.';

-- --- Fixture ----------------------------------------------------------------

create table public.fixtures (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  stage_id      uuid references public.stages(id) on delete set null,
  -- "Grupo A". Redundante con el grupo de los equipos, pero deja consultar el
  -- fixture sin joinear teams y sobrevive si un equipo cambia de grupo.
  group_label   text not null,
  -- Fecha del torneo (1 a 3) y turno dentro de la fecha (1 o 2).
  matchday      smallint not null check (matchday > 0),
  slot          smallint not null check (slot > 0),
  kickoff       timestamptz not null,
  team_a_id     uuid not null references public.teams(id) on delete cascade,
  team_b_id     uuid not null references public.teams(id) on delete cascade,
  -- La partida que termino jugandose este cruce. Null mientras no se subio el
  -- replay. on delete set null: borrar una partida mal cargada no tiene por que
  -- borrar el cruce, que lo publico la organizacion.
  match_id      uuid references public.matches(id) on delete set null,
  created_at    timestamptz not null default now(),

  constraint fixtures_distinct_teams check (team_a_id <> team_b_id),
  -- Volver a correr el seed no duplica cruces.
  unique (tournament_id, matchday, slot, team_a_id, team_b_id)
);

-- Una partida no puede ser dos cruces distintos.
create unique index fixtures_match_key
  on public.fixtures (match_id)
  where match_id is not null;

create index fixtures_tournament_idx on public.fixtures (tournament_id, matchday, slot);
create index fixtures_team_a_idx     on public.fixtures (team_a_id);
create index fixtures_team_b_idx     on public.fixtures (team_b_id);

comment on table public.fixtures is
  'Cruces publicados por la organizacion. Existen antes de jugarse; match_id se completa cuando se sube el replay.';

-- --- Vista del fixture ------------------------------------------------------
--
-- Devuelve el cruce con los nombres de los dos equipos y, si ya se jugo, el
-- resultado de cada lado. Se apoya en team_match_results, que ya da vuelta la
-- partida a "equipo vs rival", asi que no hay que volver a resolver que lado
-- era cada uno.

create view public.fixture_results with (security_invoker = on) as
select
  f.id,
  f.tournament_id,
  f.stage_id,
  f.group_label,
  f.matchday,
  f.slot,
  f.kickoff,
  f.match_id,

  f.team_a_id,
  ta.name     as team_a_name,
  ta.tag      as team_a_tag,
  ta.logo_url as team_a_logo,
  ra.kills    as team_a_kills,
  ra.win      as team_a_win,

  f.team_b_id,
  tb.name     as team_b_name,
  tb.tag      as team_b_tag,
  tb.logo_url as team_b_logo,
  rb.kills    as team_b_kills,
  rb.win      as team_b_win,

  m.played_at,
  m.game_length_ms,
  m.ended_in_surrender,

  case
    when ra.win then f.team_a_id
    when rb.win then f.team_b_id
  end as winner_team_id,

  case
    when f.match_id is null then 'pendiente'
    when ra.win is null and rb.win is null then 'sin resultado'
    else 'jugado'
  end as status
from public.fixtures f
join public.teams ta on ta.id = f.team_a_id
join public.teams tb on tb.id = f.team_b_id
left join public.matches m on m.id = f.match_id
left join public.team_match_results ra on ra.match_id = f.match_id and ra.team_id = f.team_a_id
left join public.team_match_results rb on rb.match_id = f.match_id and rb.team_id = f.team_b_id;

-- --- Los equipos que descansan ----------------------------------------------
--
-- En cada turno juegan 4 de los 5 equipos de cada grupo. El que queda libre no
-- esta escrito en ningun lado: sale de restar los que juegan.

create view public.fixture_byes with (security_invoker = on) as
select
  f.tournament_id,
  f.matchday,
  f.slot,
  f.kickoff,
  t.group_label,
  t.id        as team_id,
  t.name      as team_name,
  t.logo_url  as team_logo
from (
  select distinct tournament_id, matchday, slot, kickoff from public.fixtures
) f
join public.teams t
  on t.tournament_id = f.tournament_id
 and t.group_label is not null
where not exists (
  select 1
    from public.fixtures x
   where x.tournament_id = f.tournament_id
     and x.matchday = f.matchday
     and x.slot = f.slot
     and (x.team_a_id = t.id or x.team_b_id = t.id)
);

-- --- La tabla de grupos suma la lista de universidades -----------------------
--
-- Se re-declara entera porque create or replace view solo admite sumar columnas
-- al final: el resto queda igual, palabra por palabra, y university_tags va
-- ultima. Para los equipos de una sola universidad es un arreglo de un elemento.

create or replace view public.group_standings with (security_invoker = on) as
select
  t.tournament_id,
  t.group_label,
  t.id                                as team_id,
  t.name                              as team_name,
  t.tag                               as team_tag,
  t.logo_url                          as team_logo,
  u.id                                as university_id,
  u.name                              as university_name,
  u.tag                               as university_tag,
  u.logo_url                          as university_logo,
  count(r.match_id)                                        as games,
  count(*) filter (where r.win)                            as wins,
  count(*) filter (where not r.win)                        as losses,
  coalesce(sum(r.kills), 0)                                as kills,
  coalesce(sum(r.kills_against), 0)                        as kills_against,
  coalesce(sum(r.kills) - sum(r.kills_against), 0)         as kill_diff,
  coalesce(sum(r.gold) - sum(r.gold_against), 0)           as gold_diff,
  round(avg(r.game_length_ms) / 60000.0, 1)                as avg_minutes,
  max(r.played_at)                                         as last_played_at,
  (array_remove(array_agg(r.win order by r.played_at desc nulls last, r.match_id), null))[1:5]
                                                           as form,
  rank() over (
    partition by t.tournament_id, t.group_label
        order by count(*) filter (where r.win) desc,
                 count(*) filter (where not r.win) asc,
                 coalesce(sum(r.kills) - sum(r.kills_against), 0) desc,
                 t.name asc
  )                                                        as position,
  -- Nueva: todas las universidades del plantel, la principal primero.
  coalesce(
    (
      select array_agg(un.tag order by tu.order_index, un.tag)
        from public.team_universities tu
        join public.universities un on un.id = tu.university_id
       where tu.team_id = t.id
    ),
    case when u.tag is null then '{}'::text[] else array[u.tag] end
  )                                                        as university_tags
from public.teams t
left join public.universities u on u.id = t.university_id
left join public.team_match_results r
       on r.team_id = t.id
      -- Solo fase de grupos: la etiqueta de la partida tiene que ser el grupo
      -- del equipo, asi los playoffs no suman en la tabla.
      and r.stage_label = t.group_label
      and r.win is not null
      and r.opponent_team_id is not null
where t.group_label is not null
group by t.tournament_id, t.group_label, t.id, t.name, t.tag, t.logo_url,
         u.id, u.name, u.tag, u.logo_url;

-- --- RLS --------------------------------------------------------------------

alter table public.team_universities enable row level security;
alter table public.fixtures          enable row level security;

create policy "lectura autenticada" on public.team_universities for select to authenticated using (true);
create policy "lectura autenticada" on public.fixtures          for select to authenticated using (true);
