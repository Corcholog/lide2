-- LIDE 2: universities per team and the published fixture
--
-- 1. Four teams (13, 15, 16 and 17) were formed from individual signups and mix
--    up to three universities. teams.university_id keeps the most represented
--    one (used for per-university stats) and the full list lives in
--    team_universities.
--
-- 2. The full group-phase fixture: 40 matchups in 5 slots. A matchup exists as
--    soon as the calendar is published, long before any .rofl, so it cannot
--    live in `matches`. It gets its own table, and the match is linked when it
--    is uploaded.

-- --- Universities per team -------------------------------------------------

create table public.team_universities (
  team_id       uuid     not null references public.teams(id)        on delete cascade,
  university_id uuid     not null references public.universities(id) on delete cascade,
  -- Most represented first, as the organizers list them.
  order_index   smallint not null default 0,
  primary key (team_id, university_id)
);

create index team_universities_university_idx on public.team_universities (university_id);

comment on table public.team_universities is
  'Universidades que representa cada equipo. La mayoria tiene una sola; los equipos armados con inscripciones individuales tienen varias.';

-- --- Fixture ---------------------------------------------------------------

create table public.fixtures (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  stage_id      uuid references public.stages(id) on delete set null,
  -- "Grupo A". Redundant with the teams' group, but allows querying the fixture
  -- without joining teams and survives a team changing group.
  group_label   text not null,
  -- Tournament matchday (1 to 3) and slot within it (1 or 2).
  matchday      smallint not null check (matchday > 0),
  slot          smallint not null check (slot > 0),
  kickoff       timestamptz not null,
  team_a_id     uuid not null references public.teams(id) on delete cascade,
  team_b_id     uuid not null references public.teams(id) on delete cascade,
  -- The match played for this matchup; null until the replay is uploaded.
  -- on delete set null: deleting a wrongly uploaded match keeps the matchup.
  match_id      uuid references public.matches(id) on delete set null,
  created_at    timestamptz not null default now(),

  constraint fixtures_distinct_teams check (team_a_id <> team_b_id),
  -- Re-running the seed does not duplicate matchups.
  unique (tournament_id, matchday, slot, team_a_id, team_b_id)
);

-- A match cannot belong to two matchups.
create unique index fixtures_match_key
  on public.fixtures (match_id)
  where match_id is not null;

create index fixtures_tournament_idx on public.fixtures (tournament_id, matchday, slot);
create index fixtures_team_a_idx     on public.fixtures (team_a_id);
create index fixtures_team_b_idx     on public.fixtures (team_b_id);

comment on table public.fixtures is
  'Cruces publicados por la organizacion. Existen antes de jugarse; match_id se completa cuando se sube el replay.';

-- --- Fixture view ----------------------------------------------------------
--
-- The matchup with both team names and, once played, each side's result. Built
-- on team_match_results, which already turns a match into "team vs opponent".

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

-- --- Teams resting ---------------------------------------------------------
--
-- In each slot 4 of the 5 teams in each group play. The resting team is derived
-- by subtracting the ones that play.

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

-- --- Group standings add the university list -------------------------------
--
-- Redeclared in full because create or replace view only allows appending
-- columns; everything else is unchanged and university_tags goes last.

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
  -- New: every university on the roster, main one first.
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
      -- Group phase only: the match label must be the team's group, so playoff
      -- matches do not count.
      and r.stage_label = t.group_label
      and r.win is not null
      and r.opponent_team_id is not null
where t.group_label is not null
group by t.tournament_id, t.group_label, t.id, t.name, t.tag, t.logo_url,
         u.id, u.name, u.tag, u.logo_url;

-- --- RLS -------------------------------------------------------------------

alter table public.team_universities enable row level security;
alter table public.fixtures          enable row level security;

create policy "lectura autenticada" on public.team_universities for select to authenticated using (true);
create policy "lectura autenticada" on public.fixtures          for select to authenticated using (true);
