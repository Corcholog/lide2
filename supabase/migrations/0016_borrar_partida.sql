-- ===========================================================================
-- Borrar una partida subida por error.
--
-- Hasta ahora una partida entraba y no salia mas. `unassign_match` la suelta
-- del cruce, pero la partida sigue existiendo: aparece en /partidas, sus diez
-- cuentas quedan dadas de alta en /jugadores y sus numeros siguen contando en
-- las estadisticas. Para una prueba del flujo —subir un .rofl cualquiera para
-- ver que pasa— eso deja basura que solo se limpiaba desde el SQL editor.
--
-- QUE SE LLEVA. La partida y todo lo que cuelga de ella: match_players,
-- match_files y match_bans se van por cascade, y el cruce del fixture se libera
-- solo, que para eso su match_id es `on delete set null` (el cruce lo publico
-- la organizacion; borrar un replay no lo borra a el).
--
-- Y las cuentas que SOLO existian por esta partida. `players` se llena desde
-- los replays: si una cuenta no queda en ninguna otra partida, no esta en
-- ningun plantel y nadie la emparejo con un inscripto, entonces era solo esta
-- partida y no queda nadie a quien le importe.
--
-- QUE NO. Las cuentas que jugaron alguna otra, las que estan en un plantel
-- (team_members) y las emparejadas con un inscripto (team_roster.player_id).
-- Esas tres cosas las decidio una persona o las aprendio una asignacion, y
-- borrar el jugador se las llevaria puestas sin avisar. Es la misma regla que
-- unassign_match: soltar la partida no deshace lo que se aprendio del plantel.
--
-- EL ARCHIVO NO SE BORRA DE ACA. El .rofl vive en el bucket, que Postgres no
-- toca. Lo saca quien llama a esta funcion y ANTES de llamarla: si el bucket
-- falla, la base queda intacta y se puede reintentar; al reves quedaria un
-- archivo de 15 MB sin ninguna fila que lo nombre. Es el mismo orden que usa
-- scripts/purge-leif.ts, por la misma razon.
-- ===========================================================================

create or replace function public.delete_match(p_match_id uuid)
returns jsonb
language plpgsql
as $$
declare
  -- Los jugadores hay que anotarlos antes: despues del delete no hay de donde
  -- sacar quienes eran, porque match_players se fue con la partida.
  v_jugaron uuid[];
  v_files   integer;
  v_borrados text[];
begin
  if not exists (select 1 from public.matches where id = p_match_id) then
    return jsonb_build_object('ok', false, 'error', 'Esa partida no existe.');
  end if;

  select coalesce(array_agg(distinct mp.player_id), '{}')
    into v_jugaron
    from public.match_players mp
   where mp.match_id = p_match_id
     and mp.player_id is not null;

  select count(*) into v_files
    from public.match_files mf
   where mf.match_id = p_match_id;

  delete from public.matches where id = p_match_id;

  with huerfanas as (
    delete from public.players p
     where p.id = any(v_jugaron)
       and not exists (select 1 from public.match_players mp where mp.player_id = p.id)
       and not exists (
         select 1 from public.team_members tm where tm.player_id = p.id and tm.left_at is null
       )
       and not exists (select 1 from public.team_roster r where r.player_id = p.id)
    returning coalesce(p.display_name, p.riot_game_name, left(p.puuid, 8)) as nombre
  )
  select coalesce(array_agg(nombre order by nombre), '{}') into v_borrados from huerfanas;

  return jsonb_build_object(
    'ok', true,
    'files', v_files,
    'players', to_jsonb(v_borrados)
  );
end;
$$;

comment on function public.delete_match(uuid) is
  'Borra una partida y las cuentas que solo existian por ella. Los .rofl del bucket los saca quien llama, antes.';

-- Solo el servidor (service key). Postgres otorga execute a PUBLIC por defecto.
revoke execute on function public.delete_match(uuid) from public, anon, authenticated;
