-- ===========================================================================
-- Deleting a match uploaded by mistake.
--
-- Unlinking a match from its matchup leaves it in /partidas, its accounts in
-- the site and its numbers in the stats. This removes it.
--
-- Removed: the match and its dependents (match_players, match_files and
-- match_bans cascade; the fixture matchup is released through `on delete set
-- null`), plus accounts that only existed because of this match.
--
-- Kept: accounts that played other matches, are on a roster (team_members) or
-- are linked to a signup (team_roster.player_id). Those were decided by a person
-- or learned from an assignment, like in unassign_match.
--
-- The .rofl is not deleted here: Postgres cannot reach the bucket. The caller
-- deletes it BEFORE calling this, so a storage failure leaves the database
-- intact and retryable, instead of leaving files no row refers to.
-- ===========================================================================

create or replace function public.delete_match(p_match_id uuid)
returns jsonb
language plpgsql
as $$
declare
  -- Collect the players first: after the delete, match_players is gone.
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

-- Server only (secret key). Postgres grants execute to PUBLIC by default.
revoke execute on function public.delete_match(uuid) from public, anon, authenticated;
