-- ===========================================================================
-- Linking a played match to its playoff series.
--
-- Everything downstream of a playoff result was already here. `match_context`
-- reads `matches.series_id` to call a match a playoff one; `advance_series()`
-- counts the wins, closes the series and moves the winner into the next round
-- on its own, through a trigger that fires whenever that column changes. The
-- comment on that trigger even says it "covers assigning a series to an
-- already uploaded match from the panel".
--
-- Nothing ever set the column. `assign_match_to_fixture()` links a match to a
-- group-phase matchup, and the panel offers only that, so a quarter-final
-- replay could be uploaded and then went nowhere: no phase, no round, no
-- advancement, no statistics, and it sat in the queue for good.
--
-- This is the missing half, written to mirror the fixture one: same argument
-- order, same side resolution, same jsonb answer, so the panel treats the two
-- the same way.
-- ===========================================================================

-- --- 1. The queue stops showing what is already placed ---------------------
--
-- A playoff match has no fixture, so it fell through the view's only condition
-- and stayed in the queue however many times it was assigned. Redeclared in
-- full because `create or replace view` needs every column.

create or replace view public.unassigned_matches with (security_invoker = on) as
select
  m.id                                              as match_id,
  m.played_at,
  m.game_length_ms,
  m.patch,
  m.riot_match_id,
  m.winning_side,
  m.stage_label,
  m.round_label,
  m.blue_team_id,
  m.red_team_id,
  public.side_team(m.id, 100::smallint)             as blue_guess,
  public.side_team(m.id, 200::smallint)             as red_guess,
  (
    select jsonb_agg(
             jsonb_build_object(
               'name', coalesce(p.display_name, mp.riot_game_name),
               'champion', mp.champion,
               'position', mp.position,
               'kills', mp.kills,
               'deaths', mp.deaths,
               'assists', mp.assists
             )
             order by mp.participant_index
           )
      from public.match_players mp
      left join public.players p on p.id = mp.player_id
     where mp.match_id = m.id and mp.side = 100
  )                                                 as blue_players,
  (
    select jsonb_agg(
             jsonb_build_object(
               'name', coalesce(p.display_name, mp.riot_game_name),
               'champion', mp.champion,
               'position', mp.position,
               'kills', mp.kills,
               'deaths', mp.deaths,
               'assists', mp.assists
             )
             order by mp.participant_index
           )
      from public.match_players mp
      left join public.players p on p.id = mp.player_id
     where mp.match_id = m.id and mp.side = 200
  )                                                 as red_players,
  (select count(*) from public.match_files mf where mf.match_id = m.id) as file_count
from public.matches m
where not exists (select 1 from public.fixtures f where f.match_id = m.id)
  -- New: a match already linked to a series is placed too.
  and m.series_id is null;

comment on view public.unassigned_matches is
  'Partidas subidas que todavia no se engancharon a un cruce del fixture ni a una serie de playoffs.';

-- --- 2. The assignment -----------------------------------------------------

create or replace function public.assign_match_to_series(
  p_match_id      uuid,
  p_series_id     uuid,
  p_blue_team_id  uuid default null
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

  /*
    A series knows its teams once the draw is entered (quarter-finals) or once
    the previous round is decided (semifinals and the final). Without them
    there is no way to tell which side is which, and guessing would put a
    result on the wrong team.
  */
  if v_series.team_a_id is null or v_series.team_b_id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'Esa serie todavia no tiene sus dos equipos. Carga el sorteo en /admin/cruces.'
    );
  end if;

  v_blue := p_blue_team_id;

  if v_blue is null then
    v_blue := public.side_team(p_match_id, 100::smallint);
  end if;

  -- Only one side recognised: the other one is whoever is left in the series.
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

  /*
    A BO3 is three games at most. Counting the ones already linked catches the
    same replay being assigned twice, which would otherwise hand the series to
    whoever won it. The match being reassigned to the series it is already in
    does not count against the limit.
  */
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

  -- Freed from wherever it was, so moving a match does not leave it in two
  -- places. The trigger recomputes the series it came from.
  update public.fixtures set match_id = null where match_id = p_match_id;

  update public.matches
     set series_id     = p_series_id,
         blue_team_id  = v_blue,
         red_team_id   = v_red,
         tournament_id = coalesce(v_tournament, tournament_id),
         -- The group label would be a lie here; the round is the series'.
         stage_label   = null,
         round_label   = v_series.round
   where id = p_match_id;

  update public.match_players
     set team_id = case when side = 100 then v_blue else v_red end
   where match_id = p_match_id;

  -- The rest mirrors assign_match_to_fixture(): players seen for the first
  -- time join the team, players already on another one are reported instead of
  -- being moved, and the signup sheet is matched again for both teams.
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
    'learned', v_learned,
    'matched', v_matched,
    'conflicts', to_jsonb(v_conflicts)
  );
end;
$$;

comment on function public.assign_match_to_series(uuid, uuid, uuid) is
  'Engancha una partida a su serie de playoffs. El trigger de series avanza al ganador solo.';

-- The panel calls it with the service key, as it does every write; nobody else
-- needs it.
revoke execute on function public.assign_match_to_series(uuid, uuid, uuid)
  from public, anon, authenticated;
