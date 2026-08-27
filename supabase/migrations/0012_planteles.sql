-- ===========================================================================
-- Emparejar inscriptos con cuentas de Riot.
--
-- El .rofl trae el Riot ID y nada mas; la planilla trae el nombre legal y nada
-- mas. No hay dato que una las dos cosas: lo tiene que decir una persona, o
-- mandarlo la organizacion junto con las inscripciones.
--
-- Esta migracion prepara el terreno para cuando llegue esa lista:
--
--   1. `team_roster` guarda el Riot ID DECLARADO en la planilla. Es texto, no
--      una referencia: la cuenta puede no existir todavia en `players`, porque
--      esa fila se crea recien cuando la persona juega y sube el replay (el
--      PUUID solo existe adentro del .rofl).
--   2. `link_roster_accounts()` cierra el circulo solo: cuando aparece la
--      cuenta, la empareja con el inscripto que la declaro.
--
-- O sea que se puede cargar la lista ANTES de que se juegue nada y el vinculo
-- se resuelve en la primera ingesta, sin que nadie vuelva a tocar el panel.
--
-- Para que sirve el vinculo: la universidad. Dieciseis de los 20 equipos son
-- de una sola casa y ahi el respaldo (la universidad del equipo) ya es exacto.
-- Los cuatro mezclados (13, 15, 16 y 17) tienen 2 de cada 5 mal atribuidos, y
-- sobre todo: UADE y UNCuyo tienen un solo inscripto cada una, los dos adentro
-- de equipos mezclados. Sin este vinculo, esas dos universidades no aparecen en
-- la tabla; de 13 se ven 11.
-- ===========================================================================

-- --- El Riot ID declarado en la planilla -------------------------------------

alter table public.team_roster
  add column riot_game_name text,
  -- Sin el '#'. Puede quedar null: si la organizacion manda solo el nombre, se
  -- busca entre las cuentas del equipo, que son cinco.
  add column riot_tag_line  text;

comment on column public.team_roster.riot_game_name is
  'Riot ID declarado en la inscripcion. Texto: la cuenta puede no existir todavia en players.';

create index team_roster_riot_idx
  on public.team_roster (lower(riot_game_name))
  where riot_game_name is not null;

-- --- El emparejado automatico ------------------------------------------------
--
-- Dos reglas distintas segun cuanto se sepa:
--
--   * Con Riot ID completo (nombre + tag) se busca en todo `players`: un Riot ID
--     es unico en todo Riot, asi que no hace falta acotar por equipo y encima
--     funciona aunque el inscripto haya terminado jugando en otro lado.
--   * Con el nombre solo se busca entre las cuentas que juegan en ese equipo.
--     Un game name suelto se puede repetir entre desconocidos; adentro de cinco
--     personas, no.
--
-- Se empareja SOLO cuando hay exactamente un candidato. Ante la duda no se hace
-- nada y queda para el panel: emparejar mal es peor que no emparejar, porque
-- despues le atribuye las partidas de alguien a otra universidad y nadie lo ve.
--
-- Va con un loop y no con un update masivo a proposito: son 113 filas y corre
-- pocas veces, y asi la regla se lee de arriba abajo.

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

    -- Y que esa cuenta no sea ya de otro inscripto: hay un indice unico que lo
    -- impide, pero fallar con un error de constraint a mitad del loop dejaria
    -- el resto sin emparejar.
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

-- --- Asignar un cruce tambien intenta emparejar -------------------------------
--
-- Es el momento exacto en que la base se entera de que cinco cuentas nuevas
-- juegan en tal equipo, o sea el momento en que el emparejado por nombre suelto
-- se vuelve posible. Se re-declara la funcion entera porque plpgsql no tiene
-- forma de agregarle un pedazo; lo unico que cambia esta al final.

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

  -- Nuevo: recien ahora se sabe que estas cuentas juegan en estos dos equipos,
  -- que es lo que habilita emparejar por nombre suelto.
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

-- --- Las dos listas, para el panel -------------------------------------------
--
-- roster_status trae NOMBRES LEGALES, asi que hereda el RLS de team_roster:
-- security_invoker y la policy `to authenticated`. Cuando la fase 4 abra el
-- sitio, esta vista se queda adentro igual que la tabla.

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

-- Las cuentas que juegan en cada equipo. Esta NO tiene nombres legales: son
-- Riot IDs, que ya se ven en las partidas.

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
