-- ===========================================================================
-- Decir a mano de quien es una cuenta.
--
-- El emparejado inscripto <-> cuenta lo cierra solo `link_roster_accounts()`
-- (0012_planteles.sql) cuando el Riot ID declarado en la planilla coincide con
-- el de la cuenta. Eso alcanza para los equipos que mandaron la planilla
-- completa y bien escrita; los otros no se emparejan nunca, porque la regla
-- automatica no adivina: ante la duda no hace nada, y esta bien que sea asi.
--
-- Lo que faltaba es la puerta manual del otro lado. El alta de nicks (0017)
-- pasa en la ficha del equipo, y ahi es donde quien la carga sabe de quien es
-- cada uno: los escribio el mismo. Pero decir "este nick es de esta persona"
-- solo se podia en /admin/planteles, en otra pantalla y con el formulario del
-- plantel entero.
--
-- Esta funcion es un inscripto y una cuenta, y las tres cosas que hay que
-- mirar antes de escribir:
--
--   1. La cuenta tiene que estar en el plantel de ESE equipo. Sin eso, un
--      formulario viejo —o una pestana abierta de otro equipo— le pega a un
--      inscripto la cuenta de un desconocido, y de ahi salen partidas
--      atribuidas a la universidad equivocada sin que nadie lo note.
--   2. Una cuenta es de una sola persona. Hay un indice unico que lo garantiza
--      (`team_roster_player_key`, 0008_rosters.sql), pero chocar contra el
--      devuelve un error de constraint que no le dice nada a quien lo lee.
--      Aca se devuelve el nombre del que ya la tiene, que es el dato que hace
--      falta para resolverlo.
--   3. Desasignar tiene que ser posible: `p_player_id` en null limpia el
--      vinculo. Emparejar mal y no poder deshacerlo es peor que no emparejar.
--
-- No toca `riot_game_name` ni `riot_tag_line` del inscripto: eso es lo que
-- DECLARO la planilla y sigue siendo cierto aunque haya terminado jugando con
-- otra cuenta. La diferencia entre lo declarado y lo emparejado es justamente
-- lo que muestra `roster_status`.
-- ===========================================================================

create or replace function public.assign_roster_account(
  p_roster_id uuid,
  p_player_id uuid default null
)
returns jsonb
language plpgsql
as $$
declare
  v_roster public.team_roster%rowtype;
  v_quien  text;
  v_nick   text;
  v_otro   text;
begin
  select * into v_roster from public.team_roster where id = p_roster_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Ese inscripto no existe.');
  end if;

  v_quien := coalesce(v_roster.display_name, v_roster.full_name);

  if p_player_id is null then
    update public.team_roster set player_id = null where id = p_roster_id;
    return jsonb_build_object('ok', true, 'cleared', true, 'name', v_quien);
  end if;

  select coalesce(p.riot_game_name, 'Sin nick') || coalesce('#' || p.riot_tag_line, '')
    into v_nick
    from public.players p
   where p.id = p_player_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Esa cuenta no existe.');
  end if;

  -- Ver la regla 1. Se pregunta por el plantel y no por las partidas: una
  -- cuenta cargada a mano todavia no jugo ninguna, y es justo la que se quiere
  -- emparejar antes de la fecha 1.
  if not exists (
    select 1
      from public.team_members tm
     where tm.team_id   = v_roster.team_id
       and tm.player_id = p_player_id
       and tm.left_at is null
  ) then
    return jsonb_build_object(
      'ok', false,
      'error', v_nick || ' no esta en el plantel de este equipo.'
    );
  end if;

  select coalesce(r.display_name, r.full_name) into v_otro
    from public.team_roster r
   where r.player_id = p_player_id
     and r.id <> p_roster_id
   limit 1;

  if v_otro is not null then
    return jsonb_build_object('ok', false, 'error', v_nick || ' ya es de ' || v_otro || '.');
  end if;

  update public.team_roster set player_id = p_player_id where id = p_roster_id;

  return jsonb_build_object('ok', true, 'name', v_quien, 'nick', v_nick);
end;
$$;

comment on function public.assign_roster_account(uuid, uuid) is
  'Empareja a mano un inscripto con una cuenta del plantel de su equipo, o le saca la que tenia.';

revoke execute on function public.assign_roster_account(uuid, uuid) from public, anon, authenticated;
