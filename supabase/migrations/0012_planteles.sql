-- ===========================================================================
-- Linking signups to Riot accounts.
--
-- The .rofl has the Riot ID; the signup sheet has the legal name. Nothing links
-- them except a person or a list from the organizers. This migration prepares
-- for that list:
--
--   1. `team_roster` stores the Riot ID declared on the sheet, as text: the
--      account may not exist in `players` yet (it is created when the person
--      first plays, since the PUUID only exists in the .rofl).
--   2. `link_roster_accounts()` links the account to the signup once it appears.
--
-- The list can be loaded before anything is played, and links resolve on
-- ingest.
--
-- The link decides the university for mixed teams (13, 15, 16 and 17), and some
-- universities only have players on those teams, so without it they would not
-- appear in the university table.
-- ===========================================================================

-- --- Riot ID declared on the sheet -----------------------------------------

alter table public.team_roster
  add column riot_game_name text,
  -- Without the '#'. May be null: with only a name, the search is limited to the
  -- team's accounts.
  add column riot_tag_line  text;

comment on column public.team_roster.riot_game_name is
  'Riot ID declarado en la inscripcion. Texto: la cuenta puede no existir todavia en players.';

create index team_roster_riot_idx
  on public.team_roster (lower(riot_game_name))
  where riot_game_name is not null;

-- --- Automatic linking -----------------------------------------------------
--
-- Two rules depending on what is known:
--
--   * With a full Riot ID (name + tag), search all of `players`: a Riot ID is
--     unique, so it works even if the person ended up playing elsewhere.
--   * With only a name, search the accounts playing for that team, where a
--     name is unlikely to repeat.
--
-- Link only when there is exactly one candidate. A wrong link is worse than
-- none, since it credits someone's matches to another university unnoticed.
-- A loop rather than a bulk update, so the rule reads top to bottom.

create or replace function public.link_roster_accounts(p_team_id uuid default null)
returns integer
language plpgsql
as $$
declare
  v_linked  integer := 0;
  v_row     record;
  v_player  uuid;
  v_matches integer;
begin
  for v_row in
    select id, team_id, riot_game_name, riot_tag_line
      from public.team_roster
     where player_id is null
       and riot_game_name is not null
       and btrim(riot_game_name) <> ''
       and (p_team_id is null or team_id = p_team_id)
  loop
    if v_row.riot_tag_line is not null and btrim(v_row.riot_tag_line) <> '' then
      select count(*), min(p.id::text)::uuid
        into v_matches, v_player
        from public.players p
       where lower(btrim(p.riot_game_name)) = lower(btrim(v_row.riot_game_name))
         and lower(btrim(p.riot_tag_line))  = lower(btrim(v_row.riot_tag_line));
    else
      select count(*), min(p.id::text)::uuid
        into v_matches, v_player
        from public.players p
        join public.team_members tm on tm.player_id = p.id and tm.left_at is null
       where tm.team_id = v_row.team_id
         and lower(btrim(p.riot_game_name)) = lower(btrim(v_row.riot_game_name));
    end if;

    -- And the account must not already belong to another signup: a unique
    -- index prevents it, but a constraint error mid-loop would skip the rest.
    if v_matches = 1
       and v_player is not null
       and not exists (select 1 from public.team_roster x where x.player_id = v_player)
    then
      update public.team_roster set player_id = v_player where id = v_row.id;
      v_linked := v_linked + 1;
    end if;
  end loop;

  return v_linked;
end;
$$;

comment on function public.link_roster_accounts(uuid) is
  'Empareja inscriptos con cuentas de Riot por el Riot ID declarado. Solo cuando es inequivoco.';

-- --- Assigning a matchup also tries to link --------------------------------
--
-- That is when the database learns that five accounts play for a team, which
-- enables linking by name alone. The function is redeclared in full; only the
-- end changes.

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

  -- New: these accounts are now known to play for these teams, which enables
  -- linking by name alone.
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

-- --- Both lists, for the panel ---------------------------------------------
--
-- roster_status includes legal names, so it inherits team_roster's RLS:
-- security_invoker and the `to authenticated` policy.

create view public.roster_status with (security_invoker = on) as
select
  r.id                                          as roster_id,
  r.team_id,
  t.name                                        as team_name,
  t.group_label,
  r.order_index,
  r.full_name,
  r.display_name,
  r.university_id,
  u.tag                                         as university_tag,
  r.riot_game_name                              as declared_game_name,
  r.riot_tag_line                               as declared_tag_line,
  r.player_id,
  p.riot_game_name                              as linked_game_name,
  p.riot_tag_line                               as linked_tag_line,
  (
    select count(*) from public.match_players mp where mp.player_id = r.player_id
  )                                             as games
from public.team_roster r
join public.teams t on t.id = r.team_id
left join public.universities u on u.id = r.university_id
left join public.players p on p.id = r.player_id;

comment on view public.roster_status is
  'Inscriptos con su cuenta de Riot, emparejada o declarada. Lleva nombres legales: no sale del login.';

-- Accounts playing for each team. No legal names: only Riot IDs, already
-- visible in matches.

create view public.team_accounts with (security_invoker = on) as
select
  tm.team_id,
  p.id                                          as player_id,
  coalesce(p.display_name, p.riot_game_name)    as name,
  p.riot_game_name,
  p.riot_tag_line,
  (select count(*) from public.match_players mp where mp.player_id = p.id) as games,
  exists (select 1 from public.team_roster r where r.player_id = p.id)     as linked
from public.team_members tm
join public.players p on p.id = tm.player_id
where tm.left_at is null;

comment on view public.team_accounts is
  'Cuentas de Riot que juegan en cada equipo, y si ya estan emparejadas con un inscripto.';
