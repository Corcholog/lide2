-- ===========================================================================
-- Filtering by role must filter the stats, not just the rows.
--
-- After 0029 the filter finds a champion by any role it played, but still showed
-- the numbers of all its picks rather than those in the selected role.
--
-- The role becomes a dimension, like group and matchday. For each scope the
-- view returns the whole-champion row and one row per role played; `all_roles`
-- tells them apart, like `all_groups` and `all_matchdays`. The four scopes
-- times two are written as the product of two `grouping sets`.
--
-- This cannot be done in the application: `avg_kda` and `dpm` are per-game
-- averages, and a role's average cannot be derived from the whole-champion row.
--
-- Bans have no role (a champion is banned, not a lane), so `bans`, `ban_rate`
-- and `presence` are NULL on role rows, not zero, as with `win_pct`. The table
-- hides those columns when a role is selected. `pick_rate` still applies: picks
-- in that role over the scope's matches.
--
-- `champion_stats` is not changed: the stat cards have no role filter, and
-- `positions` from 0029 is enough to name the roles.
--
-- `create or replace view` only allows appending columns, so `all_roles` goes
-- last and the definition from 0029_roles_por_campeon.sql is repeated.
-- ===========================================================================

create or replace view public.champion_meta with (security_invoker = off) as
with picked as (
  select
    s.tournament_id,
    s.phase,
    s.group_label,
    s.matchday,
    s.round_label,
    (grouping(s.group_label) = 1)                    as all_groups,
    (grouping(s.round_label) = 1)                    as all_matchdays,
    s.champion,
    -- The role as a grouping key. In grouping sets that do not group by it, it is
    -- NULL, and `all_roles` distinguishes that from a pick with an unresolved
    -- lane.
    s.position                                       as role,
    (grouping(s.position) = 1)                       as all_roles,
    count(*)                                         as picks,
    -- Picks in matches with a draft entered: the numerator of `presence`. Using
    -- all picks could push presence above 1.
    count(*) filter (where hb.match_id is not null)  as picks_with_bans,
    count(*) filter (where s.win)                    as wins,
    sum(s.kills)                                     as kills,
    sum(s.deaths)                                    as deaths,
    sum(s.assists)                                   as assists,
    round((sum(s.kills) + sum(s.assists))::numeric / greatest(sum(s.deaths), 1), 2) as kda,
    round(avg(s.damage_to_champions))                as avg_damage,
    round(avg(s.score), 2)                           as avg_score,
    -- Each game's KDA, averaged, and damage per minute. `kda` next to it is the
    -- ratio of totals.
    round(avg(s.kda), 2)                             as avg_kda,
    round(avg(s.dpm))                                as dpm,
    mode() within group (order by s.position)        as position,
    array_agg(distinct s.position) filter (where s.position is not null) as positions
  from public.player_match_stats s
  left join (select distinct match_id from public.match_bans) hb on hb.match_id = s.match_id
  group by grouping sets (
    (s.tournament_id, s.phase, s.champion),
    (s.tournament_id, s.phase, s.champion, s.matchday, s.round_label),
    (s.tournament_id, s.phase, s.champion, s.group_label),
    (s.tournament_id, s.phase, s.champion, s.group_label, s.matchday, s.round_label)
  ),
  -- Each of the four scopes twice: whole champion and per role. Postgres
  -- multiplies the two `grouping sets`.
  grouping sets ((), (s.position))
),
banned as (
  select
    c.tournament_id,
    c.phase,
    c.group_label,
    c.matchday,
    c.round_label,
    (grouping(c.group_label) = 1)                    as all_groups,
    (grouping(c.round_label) = 1)                    as all_matchdays,
    b.champion,
    count(*)                                         as bans
  from public.match_bans b
  join public.match_context c on c.match_id = b.match_id
  group by grouping sets (
    (c.tournament_id, c.phase, b.champion),
    (c.tournament_id, c.phase, b.champion, c.matchday, c.round_label),
    (c.tournament_id, c.phase, b.champion, c.group_label),
    (c.tournament_id, c.phase, b.champion, c.group_label, c.matchday, c.round_label)
  )
),
-- The rates' denominators: matches in the scope, and how many have a draft.
scope as (
  select
    c.tournament_id,
    c.phase,
    c.group_label,
    c.matchday,
    c.round_label,
    (grouping(c.group_label) = 1)                    as all_groups,
    (grouping(c.round_label) = 1)                    as all_matchdays,
    count(*)                                         as matches,
    count(*) filter (where hb.match_id is not null)  as matches_with_bans
  from public.match_context c
  left join (select distinct match_id from public.match_bans) hb on hb.match_id = c.match_id
  group by grouping sets (
    (c.tournament_id, c.phase),
    (c.tournament_id, c.phase, c.matchday, c.round_label),
    (c.tournament_id, c.phase, c.group_label),
    (c.tournament_id, c.phase, c.group_label, c.matchday, c.round_label)
  )
),
-- The union makes a champion that was always banned and never played still
-- appear in the table.
keys as (
  select tournament_id, phase, group_label, matchday, round_label,
         all_groups, all_matchdays, champion, role, all_roles from picked
  union
  -- Bans have no role, so they only feed the `all_roles` rows.
  select tournament_id, phase, group_label, matchday, round_label,
         all_groups, all_matchdays, champion, null::text, true from banned
)
select
  k.tournament_id,
  k.phase,
  k.group_label,
  k.matchday,
  k.round_label,
  k.all_groups,
  k.all_matchdays,
  k.champion,
  p.position,
  coalesce(p.picks, 0)                               as picks,
  coalesce(p.wins, 0)                                as wins,
  coalesce(p.picks, 0) - coalesce(p.wins, 0)         as losses,
  round(p.wins::numeric / nullif(p.picks, 0), 3)     as win_pct,
  coalesce(p.kills, 0)                               as kills,
  coalesce(p.deaths, 0)                              as deaths,
  coalesce(p.assists, 0)                             as assists,
  coalesce(p.kda, 0)                                 as kda,
  coalesce(p.avg_damage, 0)                          as avg_damage,
  coalesce(p.avg_score, 0)                           as avg_score,
  case when k.all_roles then coalesce(b.bans, 0) end as bans,
  sc.matches,
  coalesce(sc.matches_with_bans, 0)                  as matches_with_bans,
  -- All three rates are NULL when their denominator is zero: a champion with 0
  -- picks has no win rate, not 0%.
  round(coalesce(p.picks, 0)::numeric / nullif(sc.matches, 0), 3) as pick_rate,
  case
    when k.all_roles and coalesce(sc.matches_with_bans, 0) > 0
    then round(coalesce(b.bans, 0)::numeric / sc.matches_with_bans, 3)
  end                                                as ban_rate,
  case
    when k.all_roles and coalesce(sc.matches_with_bans, 0) > 0
    then round(
      (coalesce(p.picks_with_bans, 0) + coalesce(b.bans, 0))::numeric / sc.matches_with_bans, 3)
  end                                                as presence,
  -- At the end, since `create or replace view` only allows appending there.
  coalesce(p.avg_kda, 0)                             as avg_kda,
  coalesce(p.dpm, 0)                                 as dpm,
  coalesce(p.positions, '{}')                        as positions,
  k.all_roles
from keys k
left join picked p
       on p.tournament_id is not distinct from k.tournament_id
      and p.phase         is not distinct from k.phase
      and p.group_label   is not distinct from k.group_label
      and p.matchday      is not distinct from k.matchday
      and p.round_label   is not distinct from k.round_label
      and p.all_groups    = k.all_groups
      and p.all_matchdays = k.all_matchdays
      and p.champion      = k.champion
      and p.all_roles     = k.all_roles
      and p.role          is not distinct from k.role
left join banned b
       on k.all_roles
      and b.tournament_id is not distinct from k.tournament_id
      and b.phase         is not distinct from k.phase
      and b.group_label   is not distinct from k.group_label
      and b.matchday      is not distinct from k.matchday
      and b.round_label   is not distinct from k.round_label
      and b.all_groups    = k.all_groups
      and b.all_matchdays = k.all_matchdays
      and b.champion      = k.champion
left join scope sc
       on sc.tournament_id is not distinct from k.tournament_id
      and sc.phase         is not distinct from k.phase
      and sc.group_label   is not distinct from k.group_label
      and sc.matchday      is not distinct from k.matchday
      and sc.round_label   is not distinct from k.round_label
      and sc.all_groups    = k.all_groups
      and sc.all_matchdays = k.all_matchdays;

comment on view public.champion_meta is
  'El meta por torneo, fase, grupo, fecha y rol. `all_roles` separa la fila del campeon entero de las de cada rol; los baneos solo existen en la primera.';
comment on column public.champion_meta.all_roles is
  'true = la fila del campeon en todos los roles juntos; false = la de un rol solo, que es el que trae `position`.';
