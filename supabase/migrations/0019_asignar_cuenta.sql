-- ===========================================================================
-- Linking a signup to an account by hand.
--
-- `link_roster_accounts()` (0012_planteles.sql) links automatically only when
-- the declared Riot ID matches, and does nothing when in doubt. This is the
-- manual path, used from the team page where nicks are entered. It checks:
--
--   1. The account is on THAT team's roster. Otherwise a stale form could link a
--      stranger's account and credit matches to the wrong university.
--   2. An account belongs to one person. A unique index
--      (`team_roster_player_key`, 0008_rosters.sql) enforces it, but here the
--      error names who already has it.
--   3. Unlinking is possible: a null `p_player_id` clears the link.
--
-- The signup's `riot_game_name` and `riot_tag_line` are not changed: they are
-- what the sheet declared, and `roster_status` shows declared vs linked.
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

  -- Rule 1. Checked against the roster, not matches: a hand-entered account has
  -- no matches yet and is exactly the one to link before matchday 1.
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
