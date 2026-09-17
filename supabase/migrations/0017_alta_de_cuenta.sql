-- ===========================================================================
-- Adding a nick by hand, before that person plays.
--
-- `players` is filled from replays, so a roster cannot be completed before
-- matches are played (substitutes, late additions, whole teams before
-- matchday 1).
--
-- An account's identity is the PUUID, which only exists inside the .rofl. A
-- hand-entered account stores a placeholder instead ('manual:name#tag'), unique
-- like a PUUID. The first time that person plays, `adopt_manual_accounts()`
-- writes the real PUUID onto the same row instead of creating a new account,
-- so the links to the team (team_members) and the signup
-- (team_roster.player_id) survive and there is no duplicate.
-- ===========================================================================

-- --- Adopting hand-entered accounts ----------------------------------------

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
       -- If the PUUID already has a row, this is not a hand-entered account.
       and not exists (select 1 from public.players p where p.puuid = mp.puuid)
  loop
    -- The tag may be missing on either side (typed without #TAG, or old .rofl
    -- files without one). When both have it, it must match.
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

    -- Only when unambiguous, like link_roster_accounts(): adopting the wrong row
    -- would credit someone's matches to another person, unnoticed.
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

-- --- Adding the account ----------------------------------------------------

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

  -- An existing account is reused, not duplicated: someone who already played
  -- (being added to the roster) or an earlier hand entry.
  if v_tag is not null then
    select count(*), min(id::text)::uuid into v_cuentas, v_player
      from public.players
     where lower(btrim(riot_game_name)) = lower(v_name)
       and lower(btrim(riot_tag_line))  = lower(v_tag);
  else
    select count(*), min(id::text)::uuid into v_cuentas, v_player
      from public.players
     where lower(btrim(riot_game_name)) = lower(v_name);

  -- A bare game name can repeat across strangers; a full Riot ID cannot.
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

    -- Nobody is moved between teams automatically: a player on two lineups is a
    -- roster change or a typo, which a person must check. Remove them from the
    -- other team and add them here.
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
      -- The placeholder is the lower-case Riot ID, so adding the same nick twice
      -- hits the unique puuid constraint instead of creating two accounts.
      'manual:' || lower(v_name) || coalesce('#' || lower(v_tag), ''),
      v_name,
      v_tag
    )
    returning id into v_player;

    v_creada := true;
  end if;

  insert into public.team_members (team_id, player_id) values (p_team_id, v_player);

  -- If this nick is the one a signup declared, link them now rather than when
  -- they play.
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

-- --- Ingestion adopts before inserting players -----------------------------
--
-- The only change is marked below, one line before inserting players: the
-- following upsert looks up by puuid, so the hand-entered row must already have
-- the real PUUID to be updated instead of duplicated. The function is
-- redeclared in full; the rest matches 0003_ingest_match.sql.

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
  -- The fingerprint identifies the match, not the file: both teams upload their
  -- own .rofl of the same game, with different bytes.
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

  -- The file is always stored: if the match already existed it is kept as extra
  -- evidence (the other team's .rofl).
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

  -- New: hand-entered accounts keep their row and receive the replay's PUUID.
  -- See the note at the top.
  perform public.adopt_manual_accounts(v_match_id);

  -- Insert or update the detected players, keyed by PUUID (Riot IDs change over
  -- time).
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
