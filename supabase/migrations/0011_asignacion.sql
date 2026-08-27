-- ===========================================================================
-- Enganchar una partida subida con su cruce del fixture.
--
-- Este es el paso operativo del torneo, y hay un problema de huevo y gallina
-- que resolver:
--
--   * Para saber que equipos jugaron una partida hace falta el plantel: quien
--     es cada cuenta de Riot. Eso lo resuelve link_match_teams() por mayoria de
--     PUUIDs contra team_members.
--   * Pero el plantel no existe. Las planillas de inscripcion tienen nombres
--     legales, no cuentas de Riot, y nadie las emparejo todavia (team_roster
--     esta cargada con los 113 inscriptos y player_id en null).
--
-- La salida es al reves de lo que parece: ASIGNAR EL CRUCE ES LO QUE ENSENA EL
-- PLANTEL. Cuando el panel dice "este replay es Equipo 03 vs Equipo 20", los 5
-- PUUIDs de un lado son el plantel del 03 y los 5 del otro el del 20. A partir
-- de la segunda fecha ya se deduce solo y el panel solo confirma.
--
-- Por eso assign_match_to_fixture() hace las dos cosas de una: engancha el
-- cruce y da de alta a los jugadores que todavia no estaban en ningun equipo.
-- ===========================================================================

-- --- Que equipo jugo de un lado ---------------------------------------------
--
-- Estaba escrito dos veces adentro de link_match_teams. Se saca afuera porque
-- ahora tambien lo necesitan el panel (para sugerir la orientacion) y la
-- asignacion (para deducirla cuando se puede).

create or replace function public.side_team(p_match_id uuid, p_side smallint)
returns uuid
language sql
stable
as $$
  -- Un equipo se asigna a un lado cuando al menos 3 de los 5 jugadores figuran
  -- en su roster: tolera suplentes y jugadores todavia no cargados.
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
  -- Los casts a smallint no son adorno: Postgres no resuelve side_team(uuid,
  -- integer) contra side_team(uuid, smallint), y sin ellos esto falla recien
  -- cuando alguien lo llama.
  v_blue uuid := public.side_team(p_match_id, 100::smallint);
  v_red  uuid := public.side_team(p_match_id, 200::smallint);
begin
  -- Si los dos lados resuelven al mismo equipo, algo esta mal cargado: no se
  -- asigna ninguno en vez de inventar un enfrentamiento contra si mismo.
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

-- --- La cola del panel -------------------------------------------------------
--
-- Las partidas que todavia no son ningun cruce, con las dos alineaciones al
-- lado. Los nombres viajan armados desde la base porque el panel los muestra y
-- nada mas: asi la pagina no tiene que joinear diez filas por partida.
--
-- Va el Riot game name sin el tag (#ARG): el tag no aporta nada para reconocer
-- a alguien y es la regla del resto del sitio.

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
  -- Sugerencia de orientacion: null en la primera fecha, util despues.
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

-- --- Asignar -----------------------------------------------------------------

create or replace function public.assign_match_to_fixture(
  p_match_id      uuid,
  p_fixture_id    uuid,
  -- Que equipo jugo de azul. Se puede omitir: si algun jugador ya esta
  -- vinculado, se deduce.
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

  -- Orientacion: la que diga el panel, o la que se pueda deducir. Se intenta
  -- por los dos lados porque puede pasar que uno de los dos equipos ya tenga
  -- plantel cargado y el otro no.
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

  -- Una partida es un cruce y uno solo: si estaba enganchada a otro, se libera.
  -- Hay un indice unico parcial sobre fixtures.match_id que lo garantiza, pero
  -- fallar con un error de constraint no le explica nada a nadie.
  update public.fixtures set match_id = null
   where match_id = p_match_id and id <> p_fixture_id;

  update public.fixtures set match_id = p_match_id where id = p_fixture_id;

  update public.matches
     set blue_team_id  = v_blue,
         red_team_id   = v_red,
         tournament_id = v_fixture.tournament_id,
         -- Las etiquetas de texto quedan alineadas con el cruce. match_context
         -- ya no las mira cuando hay fixture, pero team_standings (la vista
         -- vieja, de antes del calendario) si.
         stage_label   = v_fixture.group_label,
         round_label   = 'Fecha ' || v_fixture.matchday
   where id = p_match_id;

  update public.match_players
     set team_id = case when side = 100 then v_blue else v_red end
   where match_id = p_match_id;

  -- Aprender el plantel. Solo los que no estan en ningun equipo: a alguien que
  -- ya tiene equipo no se lo muda solo, porque un jugador en dos alineaciones
  -- es una partida mal asignada o alguien jugando donde no debe, y las dos
  -- cosas las tiene que mirar una persona.
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

-- --- Desasignar ---------------------------------------------------------------
--
-- Para arreglar una asignacion equivocada. NO da de baja lo que se aprendio del
-- plantel: que el cruce estuviera mal no quiere decir que esos cinco no jueguen
-- juntos, y los planteles se editan desde /equipos. Los equipos de la partida
-- se vuelven a deducir con lo que se sepa.

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
