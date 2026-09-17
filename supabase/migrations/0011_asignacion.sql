-- ===========================================================================
-- Linking an uploaded match to its fixture matchup.
--
-- Knowing which teams played needs rosters (which Riot account belongs to
-- which team), resolved by link_match_teams() through PUUID majority against
-- team_members. But rosters start empty: signup sheets have legal names, not
-- Riot accounts.
--
-- So assigning the matchup is what teaches the rosters: once the panel says
-- "this replay is Equipo 03 vs Equipo 20", each side's five PUUIDs are that
-- team's players. From the second matchday on, orientation can be deduced and
-- the panel only confirms. assign_match_to_fixture() links the matchup and
-- registers players who are not on any team yet.
-- ===========================================================================

-- --- Which team played a side ----------------------------------------------
--
-- Extracted from link_match_teams, since the panel (to suggest orientation) and
-- the assignment (to deduce it) also need it.

create or replace function public.side_team(p_match_id uuid, p_side smallint)
returns uuid
language sql
stable
as $$
  -- A team is assigned to a side when at least 3 of the 5 players are on its
  -- roster: this tolerates substitutes and players not yet loaded.
  select best.team_id from (
    select tm.team_id, count(*) as n
      from public.match_players mp
      join public.players p on p.puuid = mp.puuid
      join public.team_members tm on tm.player_id = p.id and tm.left_at is null
     where mp.match_id = p_match_id and mp.side = p_side
     group by tm.team_id
     order by n desc
     limit 1
  ) best
  where best.n >= 3;
$$;

create or replace function public.link_match_teams(p_match_id uuid)
returns void
language plpgsql
as $$
declare
  -- The smallint casts are required: Postgres does not resolve side_team(uuid,
  -- integer) to side_team(uuid, smallint), and it would only fail when called.
  v_blue uuid := public.side_team(p_match_id, 100::smallint);
  v_red  uuid := public.side_team(p_match_id, 200::smallint);
begin
  -- If both sides resolve to the same team, something is misconfigured: neither
  -- is assigned rather than inventing a team playing itself.
  if v_blue is not null and v_blue = v_red then
    v_blue := null;
    v_red := null;
  end if;

  update public.matches
     set blue_team_id = v_blue,
         red_team_id  = v_red
   where id = p_match_id;

  update public.match_players mp
     set team_id = case when mp.side = 100 then v_blue else v_red end
   where mp.match_id = p_match_id;
end;
$$;

-- --- The panel's queue -----------------------------------------------------
--
-- Matches not yet linked to a matchup, with both lineups. Names are assembled in
-- the database, so the page does not join ten rows per match. Riot game names
-- without the tag, as on the rest of the site.

create view public.unassigned_matches with (security_invoker = on) as
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
  -- Orientation suggestion: null on the first matchday, useful afterwards.
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
where not exists (select 1 from public.fixtures f where f.match_id = m.id);

comment on view public.unassigned_matches is
  'Partidas subidas que todavia no se engancharon a un cruce del fixture.';

-- --- Assign ----------------------------------------------------------------

create or replace function public.assign_match_to_fixture(
  p_match_id      uuid,
  p_fixture_id    uuid,
  -- The team that played blue. Optional: deduced if any player is already
  -- linked.
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
  v_conflicts text[];
begin
  select * into v_fixture from public.fixtures where id = p_fixture_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Ese cruce no existe.');
  end if;

  if not exists (select 1 from public.matches where id = p_match_id) then
    return jsonb_build_object('ok', false, 'error', 'Esa partida no existe.');
  end if;

  -- Orientation: as given by the panel, or deduced. Both sides are tried, since
  -- one team may already have a roster and the other not.
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

  -- A match belongs to one matchup only; release it from any other. A partial
  -- unique index guarantees this, but a constraint error explains nothing.
  update public.fixtures set match_id = null
   where match_id = p_match_id and id <> p_fixture_id;

  update public.fixtures set match_id = p_match_id where id = p_fixture_id;

  update public.matches
     set blue_team_id  = v_blue,
         red_team_id   = v_red,
         tournament_id = v_fixture.tournament_id,
         -- Keep the text labels aligned with the matchup. match_context ignores
         -- them when there is a fixture, but the older team_standings view uses them.
         stage_label   = v_fixture.group_label,
         round_label   = 'Fecha ' || v_fixture.matchday
   where id = p_match_id;

  update public.match_players
     set team_id = case when side = 100 then v_blue else v_red end
   where match_id = p_match_id;

  -- Learn the rosters, only for players not on any team: a player on two
  -- lineups means a wrong assignment or someone playing elsewhere, which an
  -- admin must check.
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

  return jsonb_build_object(
    'ok', true,
    'blue_team_id', v_blue,
    'red_team_id', v_red,
    'matchday', v_fixture.matchday,
    'group_label', v_fixture.group_label,
    'learned', v_learned,
    'conflicts', to_jsonb(v_conflicts)
  );
end;
$$;

comment on function public.assign_match_to_fixture(uuid, uuid, uuid) is
  'Engancha una partida a su cruce, vincula los equipos y da de alta a los jugadores que no tenian.';

-- --- Unassign --------------------------------------------------------------
--
-- Fixes a wrong assignment. It does not undo what was learned for rosters (the
-- five may still play together; rosters are edited from /equipos). The match's
-- teams are deduced again from what is known.

create or replace function public.unassign_match(p_match_id uuid)
returns jsonb
language plpgsql
as $$
begin
  update public.fixtures set match_id = null where match_id = p_match_id;

  update public.matches
     set stage_label = null,
         round_label = null
   where id = p_match_id;

  perform public.link_match_teams(p_match_id);

  return jsonb_build_object('ok', true);
end;
$$;
