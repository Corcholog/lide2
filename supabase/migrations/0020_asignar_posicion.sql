-- ===========================================================================
-- Setting an account's lane by hand.
--
-- `team_lineup` (0014_plantel.sql) derives lanes from matches, so before
-- matchday 1 every account lands on the bench. `team_members.role` (unused since
-- 0001_init.sql) now stores a hand assignment, set by
-- `assign_team_member_role`, and the view prefers it over match history.
--
-- Bench slots without a role are no longer numbered in the UI; `sub_number`
-- stays in the view as a row key.
-- ===========================================================================

-- --- 1. Assigning ----------------------------------------------------------

create or replace function public.assign_team_member_role(
  p_team_id   uuid,
  p_player_id uuid,
  p_role      text default null
)
returns jsonb
language plpgsql
as $$
declare
  -- Empty means "unassigned" and clears it, like assign_roster_account with a
  -- null player_id (0019_asignar_cuenta.sql).
  v_role   text := nullif(upper(btrim(coalesce(p_role, ''))), '');
  v_nombre text;
begin
  if v_role is not null and v_role not in ('TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'SUPPORT') then
    return jsonb_build_object('ok', false, 'error', 'Esa posición no existe.');
  end if;

  select coalesce(p.display_name, p.riot_game_name) into v_nombre
    from public.players p
   where p.id = p_player_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Esa cuenta no existe.');
  end if;

  update public.team_members
     set role = v_role
   where team_id = p_team_id
     and player_id = p_player_id
     and left_at is null;

  -- FOUND after an UPDATE says whether a row was touched. Without it, setting the
  -- lane of an account not on this team would silently do nothing.
  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', v_nombre || ' no está en el plantel de este equipo.'
    );
  end if;

  return jsonb_build_object('ok', true, 'name', v_nombre, 'role', v_role);
end;
$$;

comment on function public.assign_team_member_role(uuid, uuid, text) is
  'Asigna a mano la línea de una cuenta en un equipo, o se la saca con NULL.';

revoke execute on function public.assign_team_member_role(uuid, uuid, text) from public, anon, authenticated;

-- --- 2. The view, with hand assignments ------------------------------------
--
-- Three CTEs change: `rol` combines match-derived and hand-assigned lanes (hand
-- wins), `cuentas` records which one applied, and `ordenadas` uses it to pick
-- the starter when two accounts compete for a lane. The rest matches
-- 0018_tag_a_la_vista.sql.
--
-- New at the end: `assigned_role`, the hand assignment as stored, separate from
-- `role` (the slot's effective lane), so the page can preload the dropdown.

create or replace view public.team_lineup with (security_invoker = off) as
with partidas as (
  select mp.team_id, mp.player_id, count(*) as games
    from public.match_players mp
   where mp.team_id is not null and mp.player_id is not null
   group by mp.team_id, mp.player_id
),
por_rol as (
  select mp.team_id, mp.player_id, mp.position as role, count(*) as games
    from public.match_players mp
   where mp.team_id is not null and mp.player_id is not null and mp.position is not null
   group by mp.team_id, mp.player_id, mp.position
),
rol_jugado as (
  select distinct on (team_id, player_id) team_id, player_id, role, games as role_games
    from por_rol
   order by team_id, player_id, games desc, role
),
rol_manual as (
  select tm.team_id, tm.player_id, tm.role
    from public.team_members tm
   where tm.left_at is null and tm.role is not null
),
-- A full join: an account may appear only in matches (played, no hand lane),
-- only in assignments (assigned, not played yet), or in both (hand wins).
rol as (
  select
    coalesce(j.team_id, m.team_id)     as team_id,
    coalesce(j.player_id, m.player_id) as player_id,
    coalesce(m.role, j.role)           as role,
    coalesce(j.role_games, 0)          as role_games,
    (m.role is not null)               as asignado_a_mano
  from rol_jugado j
  full join rol_manual m on m.team_id = j.team_id and m.player_id = j.player_id
),
cuentas as (
  select tm.team_id,
         tm.player_id,
         coalesce(pa.games, 0)              as games,
         r.role,
         coalesce(r.role_games, 0)          as role_games,
         coalesce(r.asignado_a_mano, false) as asignado_a_mano,
         tm.role                            as assigned_role
    from public.team_members tm
    left join partidas pa on pa.team_id = tm.team_id and pa.player_id = tm.player_id
    left join rol      r  on r.team_id  = tm.team_id and r.player_id  = tm.player_id
   where tm.left_at is null
),
ordenadas as (
  select c.*,
         row_number() over (
           partition by c.team_id, c.role
           -- Hand assignments beat played lanes, then most games in the lane.
           -- Two accounts hand-assigned to the same lane: one wins and the other
           -- goes to the bench (as with tied players in 0014_plantel.sql).
           order by c.asignado_a_mano desc, c.role_games desc, c.games desc, c.player_id
         ) as en_rol
    from cuentas c
),
titulares as (
  select * from ordenadas where role is not null and en_rol = 1
),
suplentes as (
  select o.team_id,
         o.player_id,
         o.games,
         o.assigned_role,
         row_number() over (partition by o.team_id order by o.games desc, o.player_id) as numero
    from ordenadas o
   where o.role is null or o.en_rol > 1
),
roles (role, slot) as (
  values ('TOP', 1), ('JUNGLE', 2), ('MIDDLE', 3), ('BOTTOM', 4), ('SUPPORT', 5)
),
banco as (
  select t.id as team_id,
         greatest(
           coalesce((select count(*) from public.team_roster r where r.team_id = t.id), 0) - 5,
           coalesce((select count(*) from suplentes s where s.team_id = t.id), 0)
         )::int as lugares
    from public.teams t
),
lugares as (
  select t.id as team_id, r.slot, r.role, null::bigint as sub_number
    from public.teams t
   cross join roles r
  union all
  select b.team_id, 5 + n, null, n
    from banco b, generate_series(1, b.lugares) as n
)
select
  l.team_id,
  l.slot,
  l.role,
  l.sub_number,
  (l.role is null)                                as is_substitute,
  coalesce(ti.player_id, su.player_id)            as player_id,
  coalesce(p.display_name, p.riot_game_name)      as name,
  coalesce(ti.games, su.games, 0)                 as games,
  p.riot_game_name                                as game_name,
  p.riot_tag_line                                 as tag_line,
  -- New: the hand assignment as stored. See the note at the top.
  coalesce(ti.assigned_role, su.assigned_role)    as assigned_role
from lugares l
left join titulares ti on ti.team_id = l.team_id and ti.role = l.role
left join suplentes su on su.team_id = l.team_id and su.numero = l.sub_number
left join public.players p on p.id = coalesce(ti.player_id, su.player_id);

comment on view public.team_lineup is
  'Los lugares del plantel de cada equipo: cinco roles fijos mas el banco, con el nick y el #TAG de quien ocupa cada uno cuando ya se sabe. La linea se puede asignar a mano y le gana a la deducida de las partidas. Publica: de team_roster solo sale cuantos son.';
