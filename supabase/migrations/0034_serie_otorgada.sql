-- ===========================================================================
-- Two things a playoff series needs that the group phase already had.
--
-- 1. Which game of the series a replay is. A BO3 is three games and a BO5 is
--    five; `matches.game_number` has been there since 0001 and nothing ever
--    set it, so the games of a series had no order beyond the clock. It is now
--    chosen when the replay is filed, and no two games of a series can claim
--    the same number.
--
-- 2. A series awarded without being played. A matchup can be given on a
--    no-show (0024) but a series could not, so a team failing to turn up to a
--    quarter-final left the bracket stuck with nothing in the panel able to
--    move it. An awarded series has no games: the winner goes through, and the
--    card shows W.O. instead of a score.
-- ===========================================================================

alter table public.matches
  add constraint matches_game_number_positive check (game_number is null or game_number > 0)
  not valid;

alter table public.series
  add column if not exists walkover_team_id uuid references public.teams(id) on delete set null;

comment on column public.series.walkover_team_id is
  'Equipo al que se le dio la serie sin jugarse (no presentacion). Una serie otorgada no tiene games.';

-- Only one match per game of a series. A second replay claiming game 2 is
-- either a duplicate or the wrong series, and both would change who advances.
create unique index if not exists matches_series_game_idx
  on public.matches (series_id, game_number)
  where series_id is not null and game_number is not null;

-- --- 1. Advancing, now that a series can be awarded ------------------------
--
-- Played results still come first: if games were uploaded after an award, they
-- are what counts, and the award only decides a series nobody played.
-- Redeclared in full from 0006_tournament.sql; the marked block is what is new.

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
    count(*) filter (
      where (m.winning_side = 100 and m.blue_team_id = v_series.team_a_id)
         or (m.winning_side = 200 and m.red_team_id  = v_series.team_a_id)),
    count(*) filter (
      where (m.winning_side = 100 and m.blue_team_id = v_series.team_b_id)
         or (m.winning_side = 200 and m.red_team_id  = v_series.team_b_id))
    into v_games, v_wins_a, v_wins_b
  from public.matches m
  where m.series_id = p_series_id;

  if v_series.team_a_id is not null and v_wins_a >= v_needed then
    v_winner := v_series.team_a_id;
  elsif v_series.team_b_id is not null and v_wins_b >= v_needed then
    v_winner := v_series.team_b_id;
  end if;

  -- New. Nobody played it and it was awarded: that team goes through.
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
  end if;
end;
$$;

-- --- 2. Awarding a series --------------------------------------------------
--
-- `advance_series()` runs off a trigger on `matches`, and an awarded series has
-- none, so it is called here by hand. Passing null takes the award back.

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
  select count(*) into v_games from public.matches where series_id = p_series_id;

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

revoke execute on function public.set_series_walkover(uuid, uuid)
  from public, anon, authenticated;

-- --- 3. The bracket has to be able to say so -------------------------------
--
-- `walkover_team_id` last, since `create or replace view` only appends.

create or replace view public.series_results with (security_invoker = on) as
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
  )                          as wins_b,

  s.walkover_team_id
from public.series s
left join public.stages st on st.id = s.stage_id
left join public.teams ta on ta.id = s.team_a_id
left join public.teams tb on tb.id = s.team_b_id
left join public.matches m on m.series_id = s.id
group by s.id, st.tournament_id, st.name, st.order_index,
         ta.name, ta.logo_url, tb.name, tb.logo_url;

-- --- 4. Filing a replay under its game -------------------------------------
--
-- Redeclared from 0033 with `p_game_number`; the rest is unchanged.

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

  -- New. A series given on a no-show was not played.
  if v_series.walkover_team_id is not null then
    return jsonb_build_object(
      'ok', false,
      'error', 'Esa serie esta cargada como no presentada. Si se jugo, sacale el W.O. primero.'
    );
  end if;

  -- New. Which game of the series it is, inside the best-of.
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

  return jsonb_build_object(
    'ok', true,
    'blue_team_id', v_blue,
    'red_team_id', v_red,
    'game_number', p_game_number,
    'learned', v_learned,
    'matched', v_matched,
    'conflicts', to_jsonb(v_conflicts)
  );
end;
$$;

comment on function public.assign_match_to_series(uuid, uuid, uuid, smallint) is
  'Engancha una partida a su serie y a su numero de game. El trigger de series avanza al ganador solo.';

revoke execute on function public.assign_match_to_series(uuid, uuid, uuid, smallint)
  from public, anon, authenticated;

-- The three-argument version from 0033 is replaced by the one above.
drop function if exists public.assign_match_to_series(uuid, uuid, uuid);
