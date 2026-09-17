-- ===========================================================================
-- Atomic ingestion of a match.
--
-- supabase-js cannot run several statements in one transaction, and the match,
-- its ten players and its file must be inserted together or not at all. Hence a
-- function, called over RPC by the route handler with the secret key.
--
-- The payload uses the tables' column names, so rows are built with
-- jsonb_populate_record and new columns need no change here.
-- ===========================================================================

-- --- Team linking by PUUID -------------------------------------------------
--
-- Matches are uploaded before rosters exist, so this must be re-runnable over
-- stored matches.

create or replace function public.link_match_teams(p_match_id uuid)
returns void
language plpgsql
as $$
declare
  v_blue uuid;
  v_red  uuid;
begin
  -- A team is assigned to a side when at least 3 of the 5 players are on its
  -- roster: this tolerates substitutes and players not yet loaded.
  select team_id into v_blue from (
    select tm.team_id, count(*) as n
    from public.match_players mp
    join public.players p on p.puuid = mp.puuid
    join public.team_members tm on tm.player_id = p.id and tm.left_at is null
    where mp.match_id = p_match_id and mp.side = 100
    group by tm.team_id
    order by n desc
    limit 1
  ) best where best.n >= 3;

  select team_id into v_red from (
    select tm.team_id, count(*) as n
    from public.match_players mp
    join public.players p on p.puuid = mp.puuid
    join public.team_members tm on tm.player_id = p.id and tm.left_at is null
    where mp.match_id = p_match_id and mp.side = 200
    group by tm.team_id
    order by n desc
    limit 1
  ) best where best.n >= 3;

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

create or replace function public.relink_all_matches()
returns integer
language plpgsql
as $$
declare
  v_id uuid;
  v_count integer := 0;
begin
  for v_id in select id from public.matches loop
    perform public.link_match_teams(v_id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- --- Ingestion -------------------------------------------------------------

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

-- Only the server (secret key) may write. Postgres grants execute to PUBLIC by
-- default, so it is revoked explicitly.
revoke execute on function public.ingest_match(jsonb) from public, anon, authenticated;
revoke execute on function public.link_match_teams(uuid) from public, anon, authenticated;
revoke execute on function public.relink_all_matches() from public, anon, authenticated;
