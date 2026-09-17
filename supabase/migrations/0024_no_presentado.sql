-- ===========================================================================
-- Walkovers: a team that does not turn up loses the matchup, with no replay.
--
-- The rules allow 15 minutes; after that the matchup is awarded to the team
-- present. Nothing is played, so there is no .rofl, while `matches` requires a
-- fingerprint, duration and raw metadata.
--
-- Not done: a fake `matches` row. It would show up in the match list,
-- `match_summaries`, records, average durations and champion stats, and every
-- view would need a special case to skip it.
--
-- Done: the result lives on the fixture matchup, where organizer decisions
-- already live (0007_fixture.sql). `matches` still means "played, with a file
-- to prove it", and the standings add two kinds of result.
--
-- A walkover counts as a played matchup, a win and a loss, with no kills or
-- gold (so it does not move kill difference; 0028 later made head to head the
-- tiebreak). It is excluded from average duration: `avg` ignores nulls, and a
-- zero would suggest short games.
--
-- Not covered: both teams absent. A single winner column cannot express
-- "neither"; if it happens, the matchup stays pending until a decision is made.
--
-- `team_standings` (0005) is not changed: it is the old per-stage view, no
-- longer displayed (`group_standings` is).
-- ===========================================================================

-- --- 1. Winner without playing ---------------------------------------------

alter table public.fixtures
  add column if not exists walkover_team_id uuid references public.teams(id) on delete set null;

comment on column public.fixtures.walkover_team_id is
  'El equipo al que se le dio por ganado el cruce porque el rival no se presento. Null si se jugo o esta pendiente.';

-- Two impossible states, enforced in the database:
--
--   * The walkover winner is not one of the matchup's teams: a wrong id would
--     give a point to a team from another group, unnoticed.
--   * A matchup both played and awarded: two contradictory results that the
--     standings would both count.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'fixtures_walkover_is_a_team'
  ) then
    alter table public.fixtures
      add constraint fixtures_walkover_is_a_team
      check (walkover_team_id is null
             or walkover_team_id = team_a_id
             or walkover_team_id = team_b_id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'fixtures_walkover_or_match'
  ) then
    alter table public.fixtures
      add constraint fixtures_walkover_or_match
      check (walkover_team_id is null or match_id is null);
  end if;
end $$;

-- --- 2. Setting and clearing -----------------------------------------------
--
-- A null winner clears it, to undo a mistake from the panel, like
-- `assign_roster_account` and `assign_team_member_role`.

create or replace function public.set_fixture_walkover(
  p_fixture_id     uuid,
  p_winner_team_id uuid default null
)
returns jsonb
language plpgsql
as $$
declare
  v_fixture public.fixtures%rowtype;
  v_ganador text;
  v_ausente text;
begin
  select * into v_fixture from public.fixtures where id = p_fixture_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Ese cruce no existe.');
  end if;

  if p_winner_team_id is null then
    update public.fixtures set walkover_team_id = null where id = p_fixture_id;
    return jsonb_build_object('ok', true, 'cleared', true);
  end if;

  -- The replay wins: if the matchup has a match, it was played. Report it
  -- clearly instead of hitting the check constraint above.
  if v_fixture.match_id is not null then
    return jsonb_build_object(
      'ok', false,
      'error', 'Este cruce ya tiene una partida cargada: si de verdad no se jugó, desasignala primero.'
    );
  end if;

  if p_winner_team_id <> v_fixture.team_a_id and p_winner_team_id <> v_fixture.team_b_id then
    return jsonb_build_object('ok', false, 'error', 'Ese equipo no juega este cruce.');
  end if;

  update public.fixtures
     set walkover_team_id = p_winner_team_id
   where id = p_fixture_id;

  select t.name into v_ganador from public.teams t where t.id = p_winner_team_id;
  select t.name into v_ausente
    from public.teams t
   where t.id = case when p_winner_team_id = v_fixture.team_a_id
                     then v_fixture.team_b_id else v_fixture.team_a_id end;

  return jsonb_build_object(
    'ok', true,
    'winner', v_ganador,
    'absent', v_ausente,
    'matchday', v_fixture.matchday
  );
end;
$$;

comment on function public.set_fixture_walkover(uuid, uuid) is
  'Da un cruce por ganado porque el rival no se presento, o limpia esa carga con el ganador en null.';

revoke execute on function public.set_fixture_walkover(uuid, uuid) from public, anon, authenticated;

-- --- 3. The fixture view ---------------------------------------------------
--
-- Three expressions change and one column is appended; everything else matches
-- 0009_fixture_detalle.sql, as `create or replace view` requires.
--
--   * `team_a_win` / `team_b_win` account for walkovers, so the fixture styles
--     the winner and the absent team.
--   * `winner_team_id` includes the walkover winner.
--   * `status` adds 'w.o.', separating "not played yet" from "will not be
--     played".

create or replace view public.fixture_results with (security_invoker = on) as
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
  coalesce(ra.win, f.walkover_team_id = f.team_a_id) as team_a_win,

  f.team_b_id,
  tb.name     as team_b_name,
  tb.tag      as team_b_tag,
  tb.logo_url as team_b_logo,
  rb.kills    as team_b_kills,
  coalesce(rb.win, f.walkover_team_id = f.team_b_id) as team_b_win,

  m.played_at,
  m.game_length_ms,
  m.ended_in_surrender,

  case
    when f.walkover_team_id is not null then f.walkover_team_id
    when ra.win then f.team_a_id
    when rb.win then f.team_b_id
  end as winner_team_id,

  case
    when f.walkover_team_id is not null then 'w.o.'
    when f.match_id is null then 'pendiente'
    when ra.win is null and rb.win is null then 'sin resultado'
    else 'jugado'
  end as status,

  public.team_university_tags(f.team_a_id) as team_a_universities,
  public.team_university_tags(f.team_b_id) as team_b_universities,

  -- New: the team awarded the matchup without playing, so the page can show
  -- "W.O." instead of a score.
  f.walkover_team_id
from public.fixtures f
join public.teams ta on ta.id = f.team_a_id
join public.teams tb on tb.id = f.team_b_id
left join public.matches m on m.id = f.match_id
left join public.team_match_results ra on ra.match_id = f.match_id and ra.team_id = f.team_a_id
left join public.team_match_results rb on rb.match_id = f.match_id and rb.team_id = f.team_b_id;

comment on view public.fixture_results is
  'El fixture con el resultado de cada cruce: el marcador en kills si se jugo, o quien gano por no presentacion del rival.';

-- --- 4. Standings add both kinds of result ---------------------------------
--
-- Played and awarded results are combined in a CTE before grouping; the rest of
-- the view matches 0010_stats.sql.
--
-- A walkover is two rows: the present team's win and the absent team's loss.
-- Without the loss, total wins would no longer equal total losses within a
-- group.
--
-- `games` changes from `count(r.match_id)` to `count(r.win)`: the same for
-- played matches, and it counts walkovers as played.

create or replace view public.group_standings with (security_invoker = on) as
with resultados as (
  -- Played results.
  select r.team_id,
         r.match_id,
         r.win,
         r.kills,
         r.kills_against,
         r.gold,
         r.gold_against,
         r.game_length_ms,
         r.played_at,
         c.group_label
    from public.team_match_results r
    join public.match_context c on c.match_id = r.match_id
   where r.win is not null
     and r.opponent_team_id is not null
     and c.phase = 'grupos'
  union all
  -- Awarded results. The date is the matchup's scheduled date, so `form` and
  -- `last_played_at` place the walkover where it would have been played.
  select w.team_id,
         null::uuid,
         w.win,
         0, 0, 0, 0,
         null::integer,
         w.kickoff,
         w.group_label
    from (
      select f.walkover_team_id as team_id, true as win, f.kickoff, f.group_label
        from public.fixtures f
       where f.walkover_team_id is not null
      union all
      select case when f.walkover_team_id = f.team_a_id then f.team_b_id else f.team_a_id end,
             false, f.kickoff, f.group_label
        from public.fixtures f
       where f.walkover_team_id is not null
    ) w
)
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
  count(r.win)                                             as games,
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
  public.team_university_tags(t.id)                        as university_tags
from public.teams t
left join public.universities u on u.id = t.university_id
left join resultados r on r.team_id = t.id and r.group_label = t.group_label
where t.group_label is not null
group by t.tournament_id, t.group_label, t.id, t.name, t.tag, t.logo_url,
         u.id, u.name, u.tag, u.logo_url;

comment on view public.group_standings is
  'La tabla de cada grupo. Suma lo jugado y lo ganado por no presentacion; el W.O. cuenta partido, victoria y derrota, pero no kills ni oro.';

-- --- 5. Assigning a match to an awarded matchup ----------------------------
--
-- The check constraint prevents it, but its error reads like a system failure in
-- the panel. This reports the contradiction clearly. The function is redeclared
-- in full; only the marked lines are new, the rest matches 0012_planteles.sql.

create or replace function public.assign_match_to_fixture(
  p_match_id      uuid,
  p_fixture_id    uuid,
  p_blue_team_id  uuid default null
)
returns jsonb
language plpgsql
as $$
declare
  v_fixture   public.fixtures%rowtype;
  v_blue      uuid;
  v_red       uuid;
  v_other     uuid;
  v_learned   integer := 0;
  v_matched   integer := 0;
  v_conflicts text[];
begin
  select * into v_fixture from public.fixtures where id = p_fixture_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Ese cruce no existe.');
  end if;

  if not exists (select 1 from public.matches where id = p_match_id) then
    return jsonb_build_object('ok', false, 'error', 'Esa partida no existe.');
  end if;

  -- New. An awarded matchup was not played; if a replay appeared, one of the two
  -- is wrong.
  if v_fixture.walkover_team_id is not null then
    return jsonb_build_object(
      'ok', false,
      'error', 'Este cruce está cargado como no presentado. Si se jugó, sacá el W.O. primero.'
    );
  end if;

  v_blue := p_blue_team_id;

  if v_blue is null then
    v_blue := public.side_team(p_match_id, 100::smallint);
  end if;

  if v_blue is null then
    v_other := public.side_team(p_match_id, 200::smallint);
    v_blue := case
                when v_other = v_fixture.team_a_id then v_fixture.team_b_id
                when v_other = v_fixture.team_b_id then v_fixture.team_a_id
              end;
  end if;

  if v_blue is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'No se puede deducir quien jugo de azul: hay que elegirlo.'
    );
  end if;

  if v_blue = v_fixture.team_a_id then
    v_red := v_fixture.team_b_id;
  elsif v_blue = v_fixture.team_b_id then
    v_red := v_fixture.team_a_id;
  else
    return jsonb_build_object('ok', false, 'error', 'Ese equipo no juega este cruce.');
  end if;

  update public.fixtures set match_id = null
   where match_id = p_match_id and id <> p_fixture_id;

  update public.fixtures set match_id = p_match_id where id = p_fixture_id;

  update public.matches
     set blue_team_id  = v_blue,
         red_team_id   = v_red,
         tournament_id = v_fixture.tournament_id,
         stage_label   = v_fixture.group_label,
         round_label   = 'Fecha ' || v_fixture.matchday
   where id = p_match_id;

  update public.match_players
     set team_id = case when side = 100 then v_blue else v_red end
   where match_id = p_match_id;

  with alta as (
    insert into public.team_members (team_id, player_id)
    select case when mp.side = 100 then v_blue else v_red end, mp.player_id
      from public.match_players mp
     where mp.match_id = p_match_id
       and mp.player_id is not null
       and not exists (
         select 1 from public.team_members tm
          where tm.player_id = mp.player_id and tm.left_at is null
       )
    returning 1
  )
  select count(*) into v_learned from alta;

  select coalesce(array_agg(distinct coalesce(p.display_name, p.riot_game_name)), '{}')
    into v_conflicts
    from public.match_players mp
    join public.players p on p.id = mp.player_id
    join public.team_members tm on tm.player_id = mp.player_id and tm.left_at is null
   where mp.match_id = p_match_id
     and tm.team_id <> (case when mp.side = 100 then v_blue else v_red end);

  v_matched := public.link_roster_accounts(v_blue) + public.link_roster_accounts(v_red);

  return jsonb_build_object(
    'ok', true,
    'blue_team_id', v_blue,
    'red_team_id', v_red,
    'matchday', v_fixture.matchday,
    'group_label', v_fixture.group_label,
    'learned', v_learned,
    'matched', v_matched,
    'conflicts', to_jsonb(v_conflicts)
  );
end;
$$;
