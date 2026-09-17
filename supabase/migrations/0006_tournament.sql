-- ===========================================================================
-- Tournament structure in the database.
--
-- LIDE 2 has 20 teams from 13 universities in 4 groups of 5, three group
-- matchdays, then BO3 quarter-finals and semi-finals and a BO5 final. This adds:
--
--   1. Universities.
--   2. Each team's group, so standings show every team before anyone plays.
--   3. A bracket that advances itself: uploading a series' .rofl moves the
--      winner to the next round.
--
-- It also adds the tournament dimension to the aggregate views, so editions do
-- not mix.
-- ===========================================================================

-- --- Universities ----------------------------------------------------------

create table public.universities (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  -- Short tag for tables and cards ("UNLP").
  tag         text not null,
  logo_url    text,
  created_at  timestamptz not null default now()
);

create unique index universities_tag_key on public.universities (lower(tag));

alter table public.teams
  add column university_id uuid references public.universities(id) on delete set null,
  -- Group within the group phase: "Grupo A". Lets a team appear in the
  -- standings at 0-0 before playing.
  add column group_label text;

create index teams_university_idx on public.teams (university_id);
create index teams_group_idx on public.teams (tournament_id, group_label);

-- --- Bracket ---------------------------------------------------------------
--
-- next_series_id + next_slot chain the series: the winner of quarter-final 1
-- goes to slot A of semi-final 1. slot_label describes where each side comes
-- from while it is unknown ("1º A", "Ganador C1-D2").

alter table public.series
  add column next_series_id uuid references public.series(id) on delete set null,
  add column next_slot      char(1) check (next_slot in ('a', 'b')),
  add column slot_a_label   text,
  add column slot_b_label   text,
  add column order_index    smallint not null default 0;

create index series_next_idx on public.series (next_series_id);

-- --- Bans ------------------------------------------------------------------
--
-- The .rofl has no draft: bans are entered by hand, so this table may stay
-- empty or fill in late. Ban stats only use matches that have them.

create table public.match_bans (
  id           uuid primary key default gen_random_uuid(),
  match_id     uuid not null references public.matches(id) on delete cascade,
  side         smallint not null check (side in (100, 200)),
  champion     text not null,
  -- Ban order in the draft (1 to 5 per side).
  order_index  smallint not null,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (match_id, side, order_index)
);

create index match_bans_match_idx on public.match_bans (match_id);
create index match_bans_champion_idx on public.match_bans (champion);

-- --- Bracket advancement ---------------------------------------------------

create or replace function public.advance_series(p_series_id uuid)
returns void
language plpgsql
as $$
declare
  v_series  public.series%rowtype;
  v_needed  integer;
  v_wins_a  integer;
  v_wins_b  integer;
  v_winner  uuid;
begin
  select * into v_series from public.series where id = p_series_id;
  if not found then
    return;
  end if;

  -- A BO3 is won with 2, a BO5 with 3.
  v_needed := v_series.best_of / 2 + 1;

  select
    count(*) filter (
      where (m.winning_side = 100 and m.blue_team_id = v_series.team_a_id)
         or (m.winning_side = 200 and m.red_team_id  = v_series.team_a_id)),
    count(*) filter (
      where (m.winning_side = 100 and m.blue_team_id = v_series.team_b_id)
         or (m.winning_side = 200 and m.red_team_id  = v_series.team_b_id))
    into v_wins_a, v_wins_b
  from public.matches m
  where m.series_id = p_series_id;

  if v_series.team_a_id is not null and v_wins_a >= v_needed then
    v_winner := v_series.team_a_id;
  elsif v_series.team_b_id is not null and v_wins_b >= v_needed then
    v_winner := v_series.team_b_id;
  end if;

  update public.series
     set winner_team_id = v_winner,
         status = case
                    when v_winner is not null       then 'finished'
                    when v_wins_a + v_wins_b > 0    then 'playing'
                    else 'pending'
                  end
   where id = p_series_id;

  -- The winner takes its place in the next round. Always written (not only
  -- when empty), so correcting a match also fixes the bracket.
  if v_winner is not null and v_series.next_series_id is not null then
    if v_series.next_slot = 'a' then
      update public.series set team_a_id = v_winner where id = v_series.next_series_id;
    else
      update public.series set team_b_id = v_winner where id = v_series.next_series_id;
    end if;

    perform public.advance_series(v_series.next_series_id);
  end if;
end;
$$;

/*
 * Ingestion does not know about series: a trigger links them instead of
 * redefining ingest_match(), and also covers assigning a series to an already
 * uploaded match from the panel.
 */
create or replace function public.trg_advance_series()
returns trigger
language plpgsql
as $$
begin
  if new.series_id is not null then
    perform public.advance_series(new.series_id);
  end if;

  -- If the match is moved out of a series, that series is recomputed too.
  if tg_op = 'UPDATE' and old.series_id is not null and old.series_id is distinct from new.series_id then
    perform public.advance_series(old.series_id);
  end if;

  return null;
end;
$$;

create trigger matches_advance_series
  after insert or update of series_id, winning_side, blue_team_id, red_team_id
  on public.matches
  for each row
  execute function public.trg_advance_series();

-- --- Tournament in the aggregate views -------------------------------------
--
-- New columns go at the end: create or replace view only allows appending
-- columns, and dependent views need no changes.

create or replace view public.team_match_results with (security_invoker = on) as
with sides as (
  select m.id as match_id, m.blue_team_id as team_id, m.red_team_id as opponent_team_id,
         100::smallint as side, 200::smallint as opponent_side
    from public.matches m
   where m.blue_team_id is not null
  union all
  select m.id, m.red_team_id, m.blue_team_id,
         200::smallint, 100::smallint
    from public.matches m
   where m.red_team_id is not null
)
select
  s.match_id,
  s.team_id,
  t.name                     as team_name,
  t.tag                      as team_tag,
  s.opponent_team_id,
  o.name                     as opponent_name,
  s.side,
  m.stage_label,
  m.round_label,
  m.played_at,
  m.game_length_ms,
  m.ended_in_surrender,
  (m.winning_side = s.side)  as win,
  coalesce(own.kills, 0)     as kills,
  coalesce(rival.kills, 0)   as kills_against,
  coalesce(own.gold, 0)      as gold,
  coalesce(rival.gold, 0)    as gold_against,
  coalesce(own.dragons, 0)   as dragons,
  coalesce(own.barons, 0)    as barons,
  coalesce(own.turrets, 0)   as turrets,
  -- New: tournament and playoff series scope.
  m.tournament_id,
  m.series_id,
  coalesce(own.heralds, 0)   as heralds,
  coalesce(own.inhibitors, 0) as inhibitors
from sides s
join public.matches m on m.id = s.match_id
join public.teams t on t.id = s.team_id
left join public.teams o on o.id = s.opponent_team_id
left join public.match_team_stats own   on own.match_id   = s.match_id and own.side   = s.side
left join public.match_team_stats rival on rival.match_id = s.match_id and rival.side = s.opponent_side;

create or replace view public.match_summaries with (security_invoker = on) as
select
  m.id,
  m.played_at,
  m.patch,
  m.game_length_ms,
  m.stage_label,
  m.round_label,
  m.riot_match_id,
  m.winning_side,
  m.ended_in_surrender,
  m.blue_team_id,
  bt.name                as blue_team_name,
  m.red_team_id,
  rt.name                as red_team_name,
  blue.kills             as blue_kills,
  blue.gold              as blue_gold,
  red.kills              as red_kills,
  red.gold               as red_gold,
  mvp.riot_game_name     as mvp_name,
  mvp.champion           as mvp_champion,
  mvp.kills              as mvp_kills,
  mvp.deaths             as mvp_deaths,
  mvp.assists            as mvp_assists,
  mvp.score              as mvp_score,
  (select count(*) from public.match_files mf where mf.match_id = m.id) as file_count,
  -- New.
  m.tournament_id,
  m.series_id,
  m.game_number,
  bt.logo_url            as blue_team_logo,
  rt.logo_url            as red_team_logo
from public.matches m
left join public.teams bt on bt.id = m.blue_team_id
left join public.teams rt on rt.id = m.red_team_id
left join public.match_team_stats blue on blue.match_id = m.id and blue.side = 100
left join public.match_team_stats red  on red.match_id  = m.id and red.side  = 200
left join lateral (
  select * from public.match_player_scores s
  where s.match_id = m.id
  order by s.score desc
  limit 1
) mvp on true;

create or replace view public.player_totals with (security_invoker = on) as
select
  mp.puuid,
  max(p.id::text)::uuid                              as player_id,
  max(mp.riot_game_name)                             as riot_game_name,
  max(mp.riot_tag_line)                              as riot_tag_line,
  max(p.display_name)                                as display_name,
  max(mp.team_id::text)::uuid                        as team_id,
  count(*)                                           as games,
  count(*) filter (where mp.win)                     as wins,
  round(avg(mp.kills), 2)                            as avg_kills,
  round(avg(mp.deaths), 2)                           as avg_deaths,
  round(avg(mp.assists), 2)                          as avg_assists,
  round(
    (sum(mp.kills) + sum(mp.assists))::numeric / greatest(sum(mp.deaths), 1), 2
  )                                                  as kda,
  sum(mp.kills)                                      as kills,
  sum(mp.deaths)                                     as deaths,
  sum(mp.assists)                                    as assists,
  round(avg(mp.cs), 1)                               as avg_cs,
  round(avg(mp.gold_earned))                         as avg_gold,
  round(avg(mp.damage_to_champions))                 as avg_damage,
  round(avg(mp.vision_score), 1)                     as avg_vision,
  sum(mp.penta_kills)                                as penta_kills,
  sum(mp.quadra_kills)                               as quadra_kills,
  round(avg(s.score), 2)                             as avg_score,
  count(*) filter (where s.match_rank = 1)           as mvp_count,
  -- New: totals are per tournament.
  m.tournament_id
from public.match_players mp
join public.matches m on m.id = mp.match_id
left join public.players p on p.puuid = mp.puuid
left join public.match_player_scores s on s.match_player_id = mp.id
group by mp.puuid, m.tournament_id;

create or replace view public.player_champion_totals with (security_invoker = on) as
select
  mp.puuid,
  mp.champion,
  count(*)                        as games,
  count(*) filter (where mp.win)  as wins,
  round(
    (sum(mp.kills) + sum(mp.assists))::numeric / greatest(sum(mp.deaths), 1), 2
  )                               as kda,
  m.tournament_id
from public.match_players mp
join public.matches m on m.id = mp.match_id
group by mp.puuid, mp.champion, m.tournament_id;

create or replace view public.team_totals with (security_invoker = on) as
with team_games as (
  select m.blue_team_id as team_id, m.id as match_id, 100 as side,
         (m.winning_side = 100) as win, m.game_length_ms
  from public.matches m where m.blue_team_id is not null
  union all
  select m.red_team_id, m.id, 200,
         (m.winning_side = 200), m.game_length_ms
  from public.matches m where m.red_team_id is not null
)
select
  t.id                                        as team_id,
  t.name,
  t.tag,
  count(g.match_id)                           as games,
  count(*) filter (where g.win)               as wins,
  round(avg(g.game_length_ms) / 60000.0, 1)   as avg_minutes,
  sum(ts.kills)                               as kills,
  sum(ts.deaths)                              as deaths,
  round(avg(ts.gold))                         as avg_gold,
  sum(ts.dragons)                             as dragons,
  sum(ts.barons)                              as barons,
  sum(ts.turrets)                             as turrets,
  -- New.
  t.tournament_id,
  t.group_label,
  t.logo_url,
  t.university_id
from public.teams t
left join team_games g on g.team_id = t.id
left join public.match_team_stats ts on ts.match_id = g.match_id and ts.side = g.side
group by t.id, t.name, t.tag, t.tournament_id, t.group_label, t.logo_url, t.university_id;

-- --- Group phase standings -------------------------------------------------
--
-- Unlike team_standings (built from matches, so only teams that have played),
-- this starts from teams: every team in the group appears from day one at 0-0.

create view public.group_standings with (security_invoker = on) as
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
  )                                                        as position
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

-- --- Bracket view ----------------------------------------------------------

create view public.series_results with (security_invoker = on) as
select
  s.id,
  s.stage_id,
  st.tournament_id,
  st.name                    as stage_name,
  st.order_index             as stage_order,
  s.round,
  s.order_index,
  s.best_of,
  s.status,
  s.scheduled_at,
  s.team_a_id,
  ta.name                    as team_a_name,
  ta.logo_url                as team_a_logo,
  s.slot_a_label,
  s.team_b_id,
  tb.name                    as team_b_name,
  tb.logo_url                as team_b_logo,
  s.slot_b_label,
  s.winner_team_id,
  s.next_series_id,
  s.next_slot,
  count(m.id)                as games_played,
  count(*) filter (
    where (m.winning_side = 100 and m.blue_team_id = s.team_a_id)
       or (m.winning_side = 200 and m.red_team_id  = s.team_a_id)
  )                          as wins_a,
  count(*) filter (
    where (m.winning_side = 100 and m.blue_team_id = s.team_b_id)
       or (m.winning_side = 200 and m.red_team_id  = s.team_b_id)
  )                          as wins_b
from public.series s
left join public.stages st on st.id = s.stage_id
left join public.teams ta on ta.id = s.team_a_id
left join public.teams tb on tb.id = s.team_b_id
left join public.matches m on m.series_id = s.id
group by s.id, st.tournament_id, st.name, st.order_index,
         ta.name, ta.logo_url, tb.name, tb.logo_url;

-- --- Logo storage ----------------------------------------------------------
--
-- Public and small: team and university crests shown on the public site. The
-- .rofl files stay in their private bucket.

insert into storage.buckets (id, name, public, file_size_limit)
values ('branding', 'branding', true, 2097152)  -- 2 MB
on conflict (id) do nothing;

create policy "branding lectura publica"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'branding');

-- --- RLS for the new tables ------------------------------------------------

alter table public.universities enable row level security;
alter table public.match_bans   enable row level security;

create policy "lectura autenticada" on public.universities for select to authenticated using (true);
create policy "lectura autenticada" on public.match_bans   for select to authenticated using (true);

revoke execute on function public.advance_series(uuid) from public, anon, authenticated;
