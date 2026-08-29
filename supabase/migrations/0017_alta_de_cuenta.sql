-- ===========================================================================
-- Cargar un nick a mano, antes de que esa persona juegue.
--
-- `players` se llena sola desde los replays, y eso deja un agujero: el plantel
-- de un equipo no se puede completar hasta que se juegue. Un suplente que
-- todavia no entro, alguien que se sumo despues de la planilla o un equipo
-- entero antes de la fecha 1 no tienen forma de figurar, y la ficha del equipo
-- muestra cinco casilleros vacios aunque el equipo este completo.
--
-- EL PROBLEMA. La identidad de una cuenta es el PUUID, y el PUUID solo existe
-- adentro del .rofl: nadie lo sabe de memoria ni figura en ninguna planilla.
-- Una cuenta cargada a mano no tiene con que llenar esa columna.
--
-- LA SALIDA. Se guarda una marca en su lugar —'manual:nombre#tag'— que cumple
-- lo unico que la base le pide al PUUID: ser unica. Y la primera vez que esa
-- persona juega, `adopt_manual_accounts()` le pone el PUUID de verdad ENCIMA DE
-- LA MISMA FILA, en vez de dar de alta una cuenta nueva.
--
-- Eso ultimo es lo que hace que la funcion valga la pena. Sin la adopcion, el
-- alta manual crearia un duplicado garantizado: la persona quedaria dos veces
-- en el plantel —una con 0 partidas para siempre— y habria que limpiarlo a
-- mano. Con la adopcion, el vinculo con el equipo (team_members) y con el
-- inscripto (team_roster.player_id) sobreviven, y lo unico que cambia es que la
-- cuenta pasa a tener partidas.
-- ===========================================================================

-- --- Adoptar lo que se cargo a mano ------------------------------------------

create or replace function public.adopt_manual_accounts(p_match_id uuid)
returns integer
language plpgsql
as $$
declare
  v_row      record;
  v_player   uuid;
  v_candidatas integer;
  v_adoptadas  integer := 0;
begin
  for v_row in
    select mp.puuid, mp.riot_game_name, mp.riot_tag_line
      from public.match_players mp
     where mp.match_id = p_match_id
       and mp.riot_game_name is not null
       and btrim(mp.riot_game_name) <> ''
       -- Si el PUUID ya tiene su fila, esta cuenta no es ninguna alta manual.
       and not exists (select 1 from public.players p where p.puuid = mp.puuid)
  loop
    -- El tag puede faltar de los dos lados: quien cargo el nick pudo escribirlo
    -- sin #TAG, y hay .rofl viejos que no lo traen. Cuando esta en los dos,
    -- tiene que coincidir.
    select count(*), min(p.id::text)::uuid
      into v_candidatas, v_player
      from public.players p
     where p.puuid like 'manual:%'
       and lower(btrim(p.riot_game_name)) = lower(btrim(v_row.riot_game_name))
       and (
         p.riot_tag_line is null
         or v_row.riot_tag_line is null
         or lower(btrim(p.riot_tag_line)) = lower(btrim(v_row.riot_tag_line))
       );

    -- Solo cuando es inequivoco, igual que link_roster_accounts(): adoptar la
    -- fila equivocada le da las partidas de alguien a otra persona, y eso no lo
    -- ve nadie despues.
    if v_candidatas = 1 and v_player is not null then
      update public.players
         set puuid          = v_row.puuid,
             riot_game_name = v_row.riot_game_name,
             riot_tag_line  = v_row.riot_tag_line
       where id = v_player;

      v_adoptadas := v_adoptadas + 1;
    end if;
  end loop;

  return v_adoptadas;
end;
$$;

comment on function public.adopt_manual_accounts(uuid) is
  'Le pone el PUUID de verdad a las cuentas cargadas a mano que aparecen en una partida, en vez de duplicarlas.';

-- --- El alta ------------------------------------------------------------------

create or replace function public.add_team_account(
  p_team_id   uuid,
  p_game_name text,
  p_tag_line  text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_name    text := btrim(coalesce(p_game_name, ''));
  v_tag     text := nullif(btrim(coalesce(p_tag_line, '')), '');
  v_player  uuid;
  v_cuentas integer;
  v_creada  boolean := false;
  v_otro    text;
begin
  if v_name = '' then
    return jsonb_build_object('ok', false, 'error', 'Falta el nick.');
  end if;

  if not exists (select 1 from public.teams where id = p_team_id) then
    return jsonb_build_object('ok', false, 'error', 'Ese equipo no existe.');
  end if;

  -- Si la cuenta ya existe se reusa, no se duplica: puede ser alguien que ya
  -- jugo (y entonces esto es sumarlo al plantel) o un alta manual anterior.
  if v_tag is not null then
    select count(*), min(id::text)::uuid into v_cuentas, v_player
      from public.players
     where lower(btrim(riot_game_name)) = lower(v_name)
       and lower(btrim(riot_tag_line))  = lower(v_tag);
  else
    select count(*), min(id::text)::uuid into v_cuentas, v_player
      from public.players
     where lower(btrim(riot_game_name)) = lower(v_name);

    -- Un game name suelto se repite entre desconocidos; el Riot ID entero no.
    if v_cuentas > 1 then
      return jsonb_build_object(
        'ok', false,
        'error', 'Hay varias cuentas con ese nombre. Escribi el Riot ID completo, con #TAG.'
      );
    end if;
  end if;

  if v_cuentas = 0 then
    v_player := null;
  end if;

  if v_player is not null then
    if exists (
      select 1 from public.team_members
       where team_id = p_team_id and player_id = v_player and left_at is null
    ) then
      return jsonb_build_object('ok', false, 'error', 'Esa cuenta ya esta en el plantel.');
    end if;

    -- A nadie se lo muda solo de equipo: un jugador en dos alineaciones es un
    -- cambio de plantel o un error de dedo, y las dos cosas las mira una
    -- persona. Se saca desde el otro equipo y se vuelve a agregar aca.
    select t.name into v_otro
      from public.team_members tm
      join public.teams t on t.id = tm.team_id
     where tm.player_id = v_player and tm.left_at is null
     limit 1;

    if v_otro is not null then
      return jsonb_build_object('ok', false, 'error', 'Esa cuenta ya juega en ' || v_otro || '.');
    end if;
  else
    insert into public.players (puuid, riot_game_name, riot_tag_line)
    values (
      -- La marca es el Riot ID en minusculas, asi que cargar dos veces el mismo
      -- nick choca contra el unique de puuid en vez de crear dos cuentas.
      'manual:' || lower(v_name) || coalesce('#' || lower(v_tag), ''),
      v_name,
      v_tag
    )
    returning id into v_player;

    v_creada := true;
  end if;

  insert into public.team_members (team_id, player_id) values (p_team_id, v_player);

  -- Si el nick que se acaba de cargar es el que declaro un inscripto en la
  -- planilla, quedan emparejados ahora y no cuando juegue.
  perform public.link_roster_accounts(p_team_id);

  return jsonb_build_object(
    'ok', true,
    'player_id', v_player,
    'created', v_creada,
    'games', (select count(*) from public.match_players mp where mp.player_id = v_player)
  );
end;
$$;

comment on function public.add_team_account(uuid, text, text) is
  'Suma un nick al plantel de un equipo aunque todavia no haya jugado. Sin PUUID hasta que aparezca en un replay.';

revoke execute on function public.adopt_manual_accounts(uuid) from public, anon, authenticated;
revoke execute on function public.add_team_account(uuid, text, text) from public, anon, authenticated;

-- --- La ingesta adopta antes de dar de alta -----------------------------------
--
-- El unico cambio esta marcado abajo: una linea antes del alta de jugadores. Va
-- ahi y no despues porque el upsert siguiente busca por puuid, asi que la fila
-- manual tiene que tener ya el PUUID de verdad para que la encuentre y la
-- actualice en vez de insertar una segunda.
--
-- Se re-declara la funcion entera porque plpgsql no tiene forma de agregarle un
-- pedazo. El resto es igual a 0003_ingest_match.sql.

create or replace function public.ingest_match(payload jsonb)
returns jsonb
language plpgsql
as $$
declare
  v_match_id  uuid;
  v_status    text;
  v_file      jsonb := payload->'file';
  v_match     jsonb := payload - 'players' - 'file';
begin
  -- La huella identifica la partida, no al archivo: los dos equipos suben su
  -- propio .rofl del mismo juego y son bytes distintos.
  select id into v_match_id
    from public.matches
   where fingerprint = payload->>'fingerprint';

  if v_match_id is null then
    v_match_id := gen_random_uuid();
    v_status := 'created';

    insert into public.matches
    select (jsonb_populate_record(
      null::public.matches,
      v_match || jsonb_build_object('id', v_match_id, 'created_at', now())
    )).*;

    insert into public.match_players
    select (jsonb_populate_record(
      null::public.match_players,
      p || jsonb_build_object('id', gen_random_uuid(), 'match_id', v_match_id)
    )).*
    from jsonb_array_elements(payload->'players') p;
  else
    v_status := 'duplicate';
  end if;

  -- El archivo se guarda siempre: si la partida ya existia queda como prueba
  -- adicional (el .rofl del otro equipo).
  if v_file is not null then
    insert into public.match_files (
      match_id, storage_provider, storage_path, file_name, file_size, sha256,
      client_puuid, uploaded_by
    )
    values (
      v_match_id,
      coalesce(v_file->>'storage_provider', 'supabase'),
      v_file->>'storage_path',
      v_file->>'file_name',
      (v_file->>'file_size')::bigint,
      v_file->>'sha256',
      v_file->>'client_puuid',
      nullif(v_file->>'uploaded_by', '')::uuid
    )
    on conflict (sha256) do nothing;
  end if;

  -- LO NUEVO: las cuentas cargadas a mano se quedan con su fila y reciben el
  -- PUUID que traiga el replay. Ver el comentario de arriba de todo.
  perform public.adopt_manual_accounts(v_match_id);

  -- Alta o actualizacion de los jugadores detectados. El Riot ID cambia con el
  -- tiempo; el PUUID no, asi que es la clave.
  insert into public.players (puuid, riot_game_name, riot_tag_line, last_seen_at)
  select
    p->>'puuid',
    p->>'riot_game_name',
    p->>'riot_tag_line',
    coalesce((payload->>'played_at')::timestamptz, now())
  from jsonb_array_elements(payload->'players') p
  on conflict (puuid) do update
    set riot_game_name = coalesce(excluded.riot_game_name, public.players.riot_game_name),
        riot_tag_line  = coalesce(excluded.riot_tag_line, public.players.riot_tag_line),
        last_seen_at   = greatest(
          coalesce(public.players.last_seen_at, excluded.last_seen_at),
          excluded.last_seen_at
        );

  update public.match_players mp
     set player_id = p.id
    from public.players p
   where mp.match_id = v_match_id
     and mp.puuid = p.puuid
     and mp.player_id is distinct from p.id;

  perform public.link_match_teams(v_match_id);

  return jsonb_build_object('status', v_status, 'match_id', v_match_id);
end;
$$;

revoke execute on function public.ingest_match(jsonb) from public, anon, authenticated;
