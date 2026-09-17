-- ===========================================================================
-- Team lineups with empty slots visible.
--
-- Team pages show the lineup: five fixed slots (Top, Jungla, Mid, ADC,
-- Soporte) plus bench slots. Each slot shows the nick of whoever plays it when
-- known, otherwise the role name, and fills in as replays arrive.
--
-- The view runs as its owner and reads team_roster, which is private (legal
-- names), but only COUNT(*) per team, to know how many bench slots to draw. No
-- names leave the view, as with player_university_id() in 0010_stats.sql.
-- ===========================================================================

-- --- 1. Support is called SUPPORT ------------------------------------------
--
-- The .rofl writes UTILITY in TEAM_POSITION. One role with two names causes
-- silent bugs (`mode()` counts them as different roles, equality lookups miss
-- them), so the project uses SUPPORT only, normalized in the parser (see
-- normalizePosition in src/lib/rofl/normalize.ts). This fixes rows already
-- loaded; `match_players.raw` keeps the original JSON.

update public.match_players
   set position = 'SUPPORT'
 where position is not null
   and upper(btrim(position)) = 'UTILITY';

-- And keep it out. The parser normalizes, but seeds, manual backfills and future
-- code also write here; a one-line trigger covers every row.

create or replace function public.normalize_position()
returns trigger
language plpgsql
as $$
begin
  if new.position is not null and upper(btrim(new.position)) = 'UTILITY' then
    new.position := 'SUPPORT';
  end if;
  return new;
end;
$$;

create trigger match_players_normalize_position
  before insert or update of position on public.match_players
  for each row execute function public.normalize_position();

comment on function public.normalize_position() is
  'El soporte se guarda siempre como SUPPORT. El .rofl lo llama UTILITY.';

-- --- 2. The lineup ---------------------------------------------------------
--
-- Built in four steps:
--
--   1. Games per role for each account, with this team.
--   2. Each account's role is the one it played most (the same rule the stats
--      views use).
--   3. Each role's starter is whoever played it most; the rest, and accounts
--      that have not played, go to the bench.
--   4. Slots: always five, plus enough bench slots for every signup and every
--      extra account.
--
-- Slots exist even when empty: a team without replays still returns five rows
-- with player_id null.

create view public.team_lineup with (security_invoker = off) as
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
-- Each account's role. Tiebreaking by role name is arbitrary but stable, so a
-- player with two tied lanes does not switch slots between queries.
rol as (
  select distinct on (team_id, player_id) team_id, player_id, role, games as role_games
    from por_rol
   order by team_id, player_id, games desc, role
),
cuentas as (
  select tm.team_id,
         tm.player_id,
         coalesce(pa.games, 0)      as games,
         r.role,
         coalesce(r.role_games, 0)  as role_games
    from public.team_members tm
    left join partidas pa on pa.team_id = tm.team_id and pa.player_id = tm.player_id
    left join rol      r  on r.team_id  = tm.team_id and r.player_id  = tm.player_id
   where tm.left_at is null
),
-- A role's starter is whoever played that role most (games in the role, not
-- total games).
--
-- If two players swap the same two lanes and tie, both point to the same role,
-- one gets it and the other goes to the bench, leaving a role empty. Rare, and
-- nobody is lost, but that is the cost of resolving each account separately.
ordenadas as (
  select c.*,
         row_number() over (
           partition by c.team_id, c.role
           order by c.role_games desc, c.games desc, c.player_id
         ) as en_rol
    from cuentas c
),
titulares as (
  select * from ordenadas where role is not null and en_rol = 1
),
-- The bench: second-best players in their role and accounts that have not
-- played yet, ordered by games.
suplentes as (
  select o.team_id,
         o.player_id,
         o.games,
         row_number() over (partition by o.team_id order by o.games desc, o.player_id) as numero
    from ordenadas o
   where o.role is null or o.en_rol > 1
),
roles (role, slot) as (
  values ('TOP', 1), ('JUNGLE', 2), ('MIDDLE', 3), ('BOTTOM', 4), ('SUPPORT', 5)
),
-- How many bench slots: signups beyond the five starters, or more if more
-- accounts have played; an account that played always gets a slot.
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
  coalesce(ti.games, su.games, 0)                 as games
from lugares l
left join titulares ti on ti.team_id = l.team_id and ti.role = l.role
left join suplentes su on su.team_id = l.team_id and su.numero = l.sub_number
left join public.players p on p.id = coalesce(ti.player_id, su.player_id);

comment on view public.team_lineup is
  'Los lugares del plantel de cada equipo: cinco roles fijos mas el banco, con el nick de quien ocupa cada uno cuando ya se sabe. Publica: de team_roster solo sale cuantos son.';
