-- ===========================================================================
-- Results entered while a game is on, replays filed afterwards.
--
-- Until now a game counted only once its replay was uploaded and filed under
-- its series, so the bracket stood still for as long as the replays were
-- missing. The organizers know who won as it happens; this lets them say so.
--
-- A game result is a row of `series_game_results`: the series, the game's
-- number and the team that won it. It is not a match, so no statistic ever
-- sees it. It counts towards the series score and moves the bracket on, like a
-- replay would. When the replay is filed under the same game number it takes
-- the result's place (and says so if it disagrees on who won), so the game is
-- never counted twice.
-- ===========================================================================

create table if not exists public.series_game_results (
  series_id      uuid     not null references public.series(id) on delete cascade,
  game_number    smallint not null check (game_number > 0),
  winner_team_id uuid     not null references public.teams(id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (series_id, game_number)
);

comment on table public.series_game_results is
  'Resultado de un game cargado a mano mientras se juega, antes de tener el replay. Lo reemplaza el replay del mismo game.';

alter table public.series_game_results enable row level security;
create policy "lectura autenticada" on public.series_game_results
  for select to authenticated using (true);

-- Every game of a series that counts: the replays filed, plus the entered
-- results whose game has no replay yet.
create or replace function public.series_games(p_series_id uuid)
returns table (game_number smallint, winner_team_id uuid, live boolean)
language sql
stable
security definer
set search_path = public
as $$
  select m.game_number::smallint,
         case m.winning_side when 100 then m.blue_team_id when 200 then m.red_team_id end,
         false
    from public.matches m
   where m.series_id = p_series_id
  union all
  select g.game_number, g.winner_team_id, true
    from public.series_game_results g
   where g.series_id = p_series_id
     and not exists (
       select 1 from public.matches m
        where m.series_id = g.series_id and m.game_number = g.game_number
     );
$$;

-- Definer, so the public bracket view can count games the raw tables hide from
-- visitors (RLS). It only ever answers with who won each game of one series,
-- which that view already shows.

-- --- 1. Advancing ----------------------------------------------------------
-- Redeclared from 0034; the games now come from `series_games()`.

create or replace function public.advance_series(p_series_id uuid)
returns void
language plpgsql
as $$
declare
  v_series  public.series%rowtype;
  v_needed  integer;
  v_wins_a  integer;
  v_wins_b  integer;
  v_games   integer;
  v_winner  uuid;
begin
  select * into v_series from public.series where id = p_series_id;
  if not found then
    return;
  end if;

  -- A BO3 is won with 2, a BO5 with 3.
  v_needed := v_series.best_of / 2 + 1;

  select
    count(*),
    count(*) filter (where g.winner_team_id = v_series.team_a_id),
    count(*) filter (where g.winner_team_id = v_series.team_b_id)
    into v_games, v_wins_a, v_wins_b
  from public.series_games(p_series_id) g;

  if v_series.team_a_id is not null and v_wins_a >= v_needed then
    v_winner := v_series.team_a_id;
  elsif v_series.team_b_id is not null and v_wins_b >= v_needed then
    v_winner := v_series.team_b_id;
  end if;

  -- Nobody played it and it was awarded: that team goes through.
  if v_winner is null and v_games = 0 then
    v_winner := v_series.walkover_team_id;
  end if;

  update public.series
     set winner_team_id = v_winner,
         status = case
                    when v_winner is not null and v_games = 0 then 'w.o.'
                    when v_winner is not null                 then 'finished'
                    when v_wins_a + v_wins_b > 0              then 'playing'
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

  -- New. A result taken back (a misclick on a live score) takes the team back
  -- out of the next round, as long as nothing was played there yet.
  elsif v_series.next_series_id is not null
        and not exists (select 1 from public.series_games(v_series.next_series_id)) then
    if v_series.next_slot = 'a' then
      update public.series set team_a_id = null where id = v_series.next_series_id;
    else
      update public.series set team_b_id = null where id = v_series.next_series_id;
    end if;

    perform public.advance_series(v_series.next_series_id);
  end if;
end;
$$;


-- A result entered, changed or taken back moves the bracket like a replay does.
create or replace function public.series_game_results_advance()
returns trigger
language plpgsql
as $$
begin
  perform public.advance_series(coalesce(new.series_id, old.series_id));
  return null;
end;
$$;

drop trigger if exists series_game_results_advance on public.series_game_results;
create trigger series_game_results_advance
  after insert or update or delete on public.series_game_results
  for each row execute function public.series_game_results_advance();

-- --- 2. Entering a result --------------------------------------------------
-- Passing a null winner takes the result back.

create or replace function public.set_game_result(
  p_series_id      uuid,
  p_game_number    smallint,
  p_winner_team_id uuid default null
)
returns jsonb
language plpgsql
as $$
declare
  v_series public.series%rowtype;
begin
  select * into v_series from public.series where id = p_series_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Esa serie no existe.');
  end if;

  if p_winner_team_id is null then
    delete from public.series_game_results
     where series_id = p_series_id and game_number = p_game_number;
    return jsonb_build_object('ok', true, 'cleared', true);
  end if;

  if v_series.team_a_id is null or v_series.team_b_id is null then
    return jsonb_build_object('ok', false, 'error', 'Esa serie todavia no tiene sus dos equipos.');
  end if;

  if v_series.walkover_team_id is not null then
    return jsonb_build_object('ok', false, 'error', 'Esa serie esta cargada como no presentada.');
  end if;

  if p_game_number < 1 or p_game_number > v_series.best_of then
    return jsonb_build_object(
      'ok', false,
      'error', format('Es un BO%s: la partida va de 1 a %s.', v_series.best_of, v_series.best_of)
    );
  end if;

  if p_winner_team_id is distinct from v_series.team_a_id
     and p_winner_team_id is distinct from v_series.team_b_id then
    return jsonb_build_object('ok', false, 'error', 'Ese equipo no juega esta serie.');
  end if;

  if exists (
    select 1 from public.matches m
     where m.series_id = p_series_id and m.game_number = p_game_number
  ) then
    return jsonb_build_object(
      'ok', false,
      'error', format('La partida %s ya tiene su replay cargado.', p_game_number)
    );
  end if;

  -- Once a team has won the series there is no game left to play.
  if v_series.winner_team_id is not null and not exists (
    select 1 from public.series_game_results g
     where g.series_id = p_series_id and g.game_number = p_game_number
  ) then
    return jsonb_build_object('ok', false, 'error', 'Esa serie ya tiene ganador.');
  end if;

  insert into public.series_game_results (series_id, game_number, winner_team_id)
  values (p_series_id, p_game_number, p_winner_team_id)
  on conflict (series_id, game_number) do update set winner_team_id = excluded.winner_team_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.set_game_result(uuid, smallint, uuid)
  from public, anon, authenticated;

-- --- 3. Awarding a series --------------------------------------------------
-- Redeclared from 0034: a series with entered results was played too.

create or replace function public.set_series_walkover(
  p_series_id uuid,
  p_team_id   uuid default null
)
returns jsonb
language plpgsql
as $$
declare
  v_series public.series%rowtype;
  v_games  integer;
begin
  select * into v_series from public.series where id = p_series_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Esa serie no existe.');
  end if;

  if p_team_id is not null
     and p_team_id is distinct from v_series.team_a_id
     and p_team_id is distinct from v_series.team_b_id then
    return jsonb_build_object('ok', false, 'error', 'Ese equipo no juega esta serie.');
  end if;

  -- A series with games was played; awarding it would say two things at once.
  select count(*) into v_games from public.series_games(p_series_id);

  if p_team_id is not null and v_games > 0 then
    return jsonb_build_object(
      'ok', false,
      'error', format('Esa serie tiene %s partidas cargadas. Sacalas primero si no se jugo.', v_games)
    );
  end if;

  update public.series set walkover_team_id = p_team_id where id = p_series_id;

  perform public.advance_series(p_series_id);

  return jsonb_build_object('ok', true, 'winner_team_id', p_team_id);
end;
$$;

comment on function public.set_series_walkover(uuid, uuid) is
  'Da una serie por no presentacion, sin games. Con null la vuelve atras.';

-- --- 4. The bracket sees the entered results -------------------------------
-- `live_games` last, since `create or replace view` only appends. Public, as
-- 0013 and 0035 have it: visitors read this view, not the tables.

create or replace view public.series_results with (security_invoker = off) as
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
  count(g.live)              as games_played,
  count(*) filter (where g.winner_team_id = s.team_a_id) as wins_a,
  count(*) filter (where g.winner_team_id = s.team_b_id) as wins_b,
  s.walkover_team_id,
  count(*) filter (where g.live) as live_games
from public.series s
left join public.stages st on st.id = s.stage_id
left join public.teams ta on ta.id = s.team_a_id
left join public.teams tb on tb.id = s.team_b_id
left join lateral public.series_games(s.id) g on true
group by s.id, st.tournament_id, st.name, st.order_index,
         ta.name, ta.logo_url, tb.name, tb.logo_url;

-- --- 5. Filing a replay under its game -------------------------------------
-- Redeclared from 0034. New: a result entered for the same game gives way to
-- the replay, and `contradicts_result` says whether they disagreed.

create or replace function public.assign_match_to_series(
  p_match_id      uuid,
  p_series_id     uuid,
  p_blue_team_id  uuid default null,
  p_game_number   smallint default null
)
returns jsonb
language plpgsql
as $$
declare
  v_series    public.series%rowtype;
  v_tournament uuid;
  v_blue      uuid;
  v_red       uuid;
  v_other     uuid;
  v_played    integer;
  v_learned   integer := 0;
  v_matched   integer := 0;
  v_conflicts text[];
  v_live      uuid;
  v_replay    uuid;
begin
  select * into v_series from public.series where id = p_series_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Esa serie no existe.');
  end if;

  if not exists (select 1 from public.matches where id = p_match_id) then
    return jsonb_build_object('ok', false, 'error', 'Esa partida no existe.');
  end if;

  if v_series.team_a_id is null or v_series.team_b_id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'Esa serie todavia no tiene sus dos equipos. Carga el sorteo en /admin/cruces.'
    );
  end if;

  -- A series given on a no-show was not played.
  if v_series.walkover_team_id is not null then
    return jsonb_build_object(
      'ok', false,
      'error', 'Esa serie esta cargada como no presentada. Si se jugo, sacale el W.O. primero.'
    );
  end if;

  -- Which game of the series it is, inside the best-of.
  if p_game_number is not null
     and (p_game_number < 1 or p_game_number > v_series.best_of) then
    return jsonb_build_object(
      'ok', false,
      'error', format('Es un BO%s: la partida va de 1 a %s.', v_series.best_of, v_series.best_of)
    );
  end if;

  if p_game_number is not null and exists (
    select 1 from public.matches m
     where m.series_id = p_series_id
       and m.game_number = p_game_number
       and m.id <> p_match_id
  ) then
    return jsonb_build_object(
      'ok', false,
      'error', format('La partida %s de esa serie ya esta cargada.', p_game_number)
    );
  end if;

  v_blue := p_blue_team_id;

  if v_blue is null then
    v_blue := public.side_team(p_match_id, 100::smallint);
  end if;

  if v_blue is null then
    v_other := public.side_team(p_match_id, 200::smallint);
    v_blue := case
                when v_other = v_series.team_a_id then v_series.team_b_id
                when v_other = v_series.team_b_id then v_series.team_a_id
              end;
  end if;

  if v_blue is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'No se puede deducir quien jugo de azul: hay que elegirlo.'
    );
  end if;

  if v_blue = v_series.team_a_id then
    v_red := v_series.team_b_id;
  elsif v_blue = v_series.team_b_id then
    v_red := v_series.team_a_id;
  else
    return jsonb_build_object('ok', false, 'error', 'Ese equipo no juega esta serie.');
  end if;

  select count(*) into v_played
    from public.matches m
   where m.series_id = p_series_id and m.id <> p_match_id;

  if v_played >= v_series.best_of then
    return jsonb_build_object(
      'ok', false,
      'error', format('Esa serie ya tiene %s partidas cargadas, que es un BO%s completo.',
                      v_played, v_series.best_of)
    );
  end if;

  select st.tournament_id into v_tournament
    from public.stages st where st.id = v_series.stage_id;

  update public.fixtures set match_id = null where match_id = p_match_id;

  update public.matches
     set series_id     = p_series_id,
         game_number   = p_game_number,
         blue_team_id  = v_blue,
         red_team_id   = v_red,
         tournament_id = coalesce(v_tournament, tournament_id),
         stage_label   = null,
         round_label   = v_series.round
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

  -- A result entered while the game was on gives way to the replay. If the two
  -- disagree on who won, the replay counts and the caller is told.
  if p_game_number is not null then
    select g.winner_team_id into v_live
      from public.series_game_results g
     where g.series_id = p_series_id and g.game_number = p_game_number;

    select case m.winning_side when 100 then m.blue_team_id when 200 then m.red_team_id end
      into v_replay
      from public.matches m where m.id = p_match_id;

    delete from public.series_game_results
     where series_id = p_series_id and game_number = p_game_number;
  end if;

  return jsonb_build_object(
    'ok', true,
    'blue_team_id', v_blue,
    'red_team_id', v_red,
    'game_number', p_game_number,
    'learned', v_learned,
    'matched', v_matched,
    'conflicts', to_jsonb(v_conflicts),
    'contradicts_result', v_live is not null and v_replay is distinct from v_live
  );
end;
$$;

comment on function public.assign_match_to_series(uuid, uuid, uuid, smallint) is
  'Engancha una partida a su serie y a su numero de game, y reemplaza el resultado cargado a mano de ese game. El trigger de series avanza al ganador solo.';
