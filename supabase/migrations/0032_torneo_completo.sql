-- ===========================================================================
-- The whole tournament as a scope of its own.
--
-- Every aggregate view grouped by phase, so the widest row available was "the
-- whole group phase" or "the whole playoffs". There was no way to ask what a
-- player did across the tournament.
--
-- The phase becomes a dimension like group, matchday and role: the scope that
-- omits it is the tournament, and `all_phases` tells it apart, exactly as
-- `all_groups`, `all_matchdays` and `all_roles` already do in `champion_meta`.
--
-- This cannot be done in the application by adding up the two phases. `kda`,
-- `avg_damage`, `dpm`, `csm` and `avg_score` are per-game averages, `position`
-- is a `mode()` and the spree records are `max()`: none of them can be
-- recovered from the phase rows. Only the base rows give the right answer.
--
-- Two things to know when reading these rows:
--
--   1. `is_total` keeps meaning exactly what it meant: the row for a whole
--      phase. It gains `and grouping(phase) = 0` so the tournament rows do not
--      fall into it, which is what makes this migration invisible to every
--      query written before it. Left as a plain `grouping(round_label) = 1` it
--      would be true for the phase total *and* the tournament total, and
--      anything filtering on `is_total` without pinning a phase would silently
--      count both -- two of this repo's own tests do exactly that.
--
--      So the three scopes are told apart by a pair:
--        matchday or round -> is_total false, all_phases false
--        whole phase       -> is_total true,  all_phases false
--        whole tournament  -> is_total false, all_phases true
--
--      `all_groups`, `all_matchdays` and `all_roles` in `champion_meta` stay
--      plain `grouping()` flags: they are orthogonal by design, and every query
--      against that view pins the phase.
--
--   2. Rows whose phase could not be resolved are now excluded. A .rofl that is
--      uploaded but not yet assigned to a matchup or a series has a NULL phase
--      in `match_context`, and it can still carry a tournament id. Left in, it
--      would be counted in the tournament scope while belonging to neither
--      phase, so the totals would not add up. No query ever read those rows:
--      every scope filter pins a phase.
--
-- It also fixes something these views got wrong before: `champion_meta` and
-- `champion_stats` count the matches of a scope straight from `match_context`,
-- which is where `annulled` is defined but not applied. Their `picked` CTEs
-- read `player_match_stats` and so inherited 0031's filter, but the `scope` and
-- `banned` ones did not, so an annulled match still padded the denominator of
-- `pick_rate`, `ban_rate` and `presence`, and the two stats pages disagreed on
-- how many matches had been played. 0031 says nothing in an annulled match
-- counts for any stat; now nothing does.
--
-- `create or replace view` only allows appending columns, so `all_phases` goes
-- last everywhere and the definitions are repeated from 0025_kda_promedio.sql,
-- 0010_stats.sql, 0013_publico.sql, 0029_roles_por_campeon.sql and
-- 0030_estadisticas_por_rol.sql.
-- ===========================================================================

-- --- 1. Per-player totals --------------------------------------------------

create or replace view public.player_phase_totals with (security_invoker = off) as
select
  s.tournament_id,
  s.phase,
  s.matchday,
  s.round_label,
  (grouping(s.round_label) = 1 and grouping(s.phase) = 0) as is_total,

  s.player_id,
  max(s.player_name)                                 as player_name,
  max(s.team_id::text)::uuid                         as team_id,
  max(s.team_name)                                   as team_name,
  max(s.team_tag)                                    as team_tag,
  max(s.university_id::text)::uuid                   as university_id,
  max(s.university_tag)                              as university_tag,
  mode() within group (order by s.position)          as position,

  count(*)                                           as games,
  count(*) filter (where s.win)                      as wins,
  count(*) filter (where not s.win)                  as losses,
  sum(s.kills)                                       as kills,
  sum(s.deaths)                                      as deaths,
  sum(s.assists)                                     as assists,
  round((sum(s.kills) + sum(s.assists))::numeric / greatest(sum(s.deaths), 1), 2) as kda,
  round(avg(s.kills), 2)                             as avg_kills,
  round(avg(s.deaths), 2)                            as avg_deaths,
  round(avg(s.assists), 2)                           as avg_assists,
  round(avg(s.kill_participation), 3)                as kill_participation,
  round(avg(s.damage_share), 3)                      as damage_share,
  sum(s.damage_to_champions)                         as damage,
  round(avg(s.damage_to_champions))                  as avg_damage,
  round(avg(s.dpm))                                  as dpm,
  sum(s.damage_taken)                                as damage_taken,
  sum(s.damage_mitigated)                            as damage_mitigated,
  sum(s.gold_earned)                                 as gold,
  round(avg(s.gpm))                                  as gpm,
  sum(s.cs)                                          as cs,
  round(avg(s.csm), 1)                               as csm,
  sum(s.vision_score)                                as vision_score,
  round(avg(s.vision_score), 1)                      as avg_vision,
  sum(s.wards_placed)                                as wards_placed,
  sum(s.wards_killed)                                as wards_killed,
  max(s.largest_killing_spree)                       as best_killing_spree,
  max(s.largest_multi_kill)                          as best_multi_kill,
  sum(s.double_kills)                                as double_kills,
  sum(s.triple_kills)                                as triple_kills,
  sum(s.quadra_kills)                                as quadra_kills,
  sum(s.penta_kills)                                 as penta_kills,
  sum(s.time_ccing_others)                           as time_ccing_others,
  sum(s.total_time_spent_dead)                       as time_dead,
  round(avg(s.score), 2)                             as avg_score,
  count(*) filter (where s.match_rank = 1)           as mvp_count,
  round(avg(s.kda), 2)                               as avg_kda,

  (grouping(s.phase) = 1)                            as all_phases
from public.player_match_stats s
where s.player_id is not null and s.phase is not null
group by grouping sets (
  (s.tournament_id, s.phase, s.player_id, s.matchday, s.round_label),
  (s.tournament_id, s.phase, s.player_id),
  -- The tournament: both phases together.
  (s.tournament_id, s.player_id)
);

-- --- 2. Per-team totals ----------------------------------------------------
--
-- Playoff series are counted game by game, like the group phase: a 2-1 is two
-- wins and one loss. The bracket already shows who won the series, and games
-- are what every other number here is made of.

create or replace view public.team_phase_totals with (security_invoker = off) as
select
  c.tournament_id,
  c.phase,
  c.matchday,
  c.round_label,
  (grouping(c.round_label) = 1 and grouping(c.phase) = 0) as is_total,

  r.team_id,
  max(r.team_name)                                   as team_name,
  max(r.team_tag)                                    as team_tag,
  max(t.group_label)                                 as group_label,
  max(t.logo_url)                                    as team_logo,

  count(*)                                           as games,
  count(*) filter (where r.win)                      as wins,
  count(*) filter (where not r.win)                  as losses,
  round(count(*) filter (where r.win)::numeric / nullif(count(*), 0), 3) as win_pct,
  sum(r.kills)                                       as kills,
  sum(r.kills_against)                               as kills_against,
  sum(r.kills) - sum(r.kills_against)                as kill_diff,
  sum(r.gold)                                        as gold,
  sum(r.gold) - sum(r.gold_against)                  as gold_diff,
  round(avg(r.game_length_ms) / 60000.0, 1)          as avg_minutes,
  sum(r.dragons)                                     as dragons,
  sum(r.barons)                                      as barons,
  sum(r.heralds)                                     as heralds,
  sum(r.turrets)                                     as turrets,
  sum(r.dragons) + sum(r.barons) + sum(r.heralds)    as objectives,

  (grouping(c.phase) = 1)                            as all_phases
from public.team_match_results r
join public.match_context c on c.match_id = r.match_id
join public.teams t on t.id = r.team_id
where r.win is not null and r.opponent_team_id is not null and c.phase is not null
group by grouping sets (
  (c.tournament_id, c.phase, r.team_id, c.matchday, c.round_label),
  (c.tournament_id, c.phase, r.team_id),
  (c.tournament_id, r.team_id)
);

-- --- 3. Per-university totals ----------------------------------------------

create or replace view public.university_totals with (security_invoker = off) as
select
  s.tournament_id,
  s.phase,
  s.matchday,
  s.round_label,
  (grouping(s.round_label) = 1 and grouping(s.phase) = 0) as is_total,

  s.university_id,
  max(s.university_tag)                              as university_tag,
  max(s.university_name)                             as university_name,
  max(s.university_logo)                             as university_logo,

  count(distinct s.match_id)                         as matches,
  count(distinct s.team_id)                          as teams,
  count(distinct s.player_id)                        as players,
  count(*)                                           as appearances,
  count(*) filter (where s.win)                      as wins,
  count(*) filter (where not s.win)                  as losses,
  round(count(*) filter (where s.win)::numeric / nullif(count(*), 0), 3) as win_pct,
  sum(s.kills)                                       as kills,
  sum(s.deaths)                                      as deaths,
  sum(s.assists)                                     as assists,
  round((sum(s.kills) + sum(s.assists))::numeric / greatest(sum(s.deaths), 1), 2) as kda,
  sum(s.damage_to_champions)                         as damage,
  sum(s.gold_earned)                                 as gold,
  sum(s.vision_score)                                as vision_score,
  sum(s.penta_kills)                                 as penta_kills,
  round(avg(s.score), 2)                             as avg_score,

  (grouping(s.phase) = 1)                            as all_phases
from public.player_match_stats s
where s.university_id is not null and s.phase is not null
group by grouping sets (
  (s.tournament_id, s.phase, s.university_id, s.matchday, s.round_label),
  (s.tournament_id, s.phase, s.university_id),
  (s.tournament_id, s.university_id)
);

-- --- 4. Champion stats -----------------------------------------------------
--
-- `all_phases` joins the CTEs together with the other scope keys. Without it
-- the tournament rows and the phase rows would both carry a NULL phase and
-- `is not distinct from` would match them to each other.

create or replace view public.champion_stats with (security_invoker = off) as
with picked as (
  select
    s.tournament_id,
    s.phase,
    s.matchday,
    s.round_label,
    (grouping(s.round_label) = 1 and grouping(s.phase) = 0) as is_total,
    (grouping(s.phase) = 1)                          as all_phases,
    s.champion,
    count(*)                                         as picks,
    count(*) filter (where hb.match_id is not null)  as picks_with_bans,
    count(*) filter (where s.win)                    as wins,
    sum(s.kills)                                     as kills,
    sum(s.deaths)                                    as deaths,
    sum(s.assists)                                   as assists,
    round((sum(s.kills) + sum(s.assists))::numeric / greatest(sum(s.deaths), 1), 2) as kda,
    round(avg(s.damage_to_champions))                as avg_damage,
    round(avg(s.score), 2)                           as avg_score,
    mode() within group (order by s.position)        as position,
    array_agg(distinct s.position) filter (where s.position is not null) as positions
  from public.player_match_stats s
  left join (select distinct match_id from public.match_bans) hb on hb.match_id = s.match_id
  where s.phase is not null
  group by grouping sets (
    (s.tournament_id, s.phase, s.champion, s.matchday, s.round_label),
    (s.tournament_id, s.phase, s.champion),
    (s.tournament_id, s.champion)
  )
),
banned as (
  select
    c.tournament_id,
    c.phase,
    c.matchday,
    c.round_label,
    (grouping(c.round_label) = 1 and grouping(c.phase) = 0) as is_total,
    (grouping(c.phase) = 1)                          as all_phases,
    b.champion,
    count(*)                                         as bans
  from public.match_bans b
  join public.match_context c on c.match_id = b.match_id
  -- Annulled matches are excluded here too: unlike `picked`, this reads
  -- `match_context` directly, so it does not inherit the filter
  -- `player_match_stats` applies (0031).
  where c.phase is not null and not coalesce(c.annulled, false)
  group by grouping sets (
    (c.tournament_id, c.phase, b.champion, c.matchday, c.round_label),
    (c.tournament_id, c.phase, b.champion),
    (c.tournament_id, b.champion)
  )
),
scope as (
  select
    c.tournament_id,
    c.phase,
    c.matchday,
    c.round_label,
    (grouping(c.round_label) = 1 and grouping(c.phase) = 0) as is_total,
    (grouping(c.phase) = 1)                          as all_phases,
    count(*)                                         as matches,
    count(*) filter (where hb.match_id is not null)  as matches_with_bans
  from public.match_context c
  left join (select distinct match_id from public.match_bans) hb on hb.match_id = c.match_id
  -- Annulled matches are excluded here too: unlike `picked`, this reads
  -- `match_context` directly, so it does not inherit the filter
  -- `player_match_stats` applies (0031).
  where c.phase is not null and not coalesce(c.annulled, false)
  group by grouping sets (
    (c.tournament_id, c.phase, c.matchday, c.round_label),
    (c.tournament_id, c.phase),
    (c.tournament_id)
  )
),
keys as (
  select tournament_id, phase, matchday, round_label, is_total, all_phases, champion from picked
  union
  select tournament_id, phase, matchday, round_label, is_total, all_phases, champion from banned
)
select
  k.tournament_id,
  k.phase,
  k.matchday,
  k.round_label,
  k.is_total,
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
  coalesce(b.bans, 0)                                as bans,
  sc.matches,
  coalesce(sc.matches_with_bans, 0)                  as matches_with_bans,
  case
    when coalesce(sc.matches_with_bans, 0) > 0
    then round(
      (coalesce(p.picks_with_bans, 0) + coalesce(b.bans, 0))::numeric / sc.matches_with_bans, 3)
  end                                                as presence,
  coalesce(p.positions, '{}')                        as positions,

  k.all_phases
from keys k
left join picked p
       on p.tournament_id is not distinct from k.tournament_id
      and p.phase         is not distinct from k.phase
      and p.matchday      is not distinct from k.matchday
      and p.round_label   is not distinct from k.round_label
      and p.is_total      = k.is_total
      and p.all_phases    = k.all_phases
      and p.champion      = k.champion
left join banned b
       on b.tournament_id is not distinct from k.tournament_id
      and b.phase         is not distinct from k.phase
      and b.matchday      is not distinct from k.matchday
      and b.round_label   is not distinct from k.round_label
      and b.is_total      = k.is_total
      and b.all_phases    = k.all_phases
      and b.champion      = k.champion
left join scope sc
       on sc.tournament_id is not distinct from k.tournament_id
      and sc.phase         is not distinct from k.phase
      and sc.matchday      is not distinct from k.matchday
      and sc.round_label   is not distinct from k.round_label
      and sc.is_total      = k.is_total
      and sc.all_phases    = k.all_phases;

-- --- 5. Champion meta ------------------------------------------------------
--
-- The tournament scope is added only at the "all groups" level: a playoff match
-- belongs to no group, so a tournament row split by group would be the group
-- phase again under another name.

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
    (grouping(s.phase) = 1)                          as all_phases,
    s.champion,
    s.position                                       as role,
    (grouping(s.position) = 1)                       as all_roles,
    count(*)                                         as picks,
    count(*) filter (where hb.match_id is not null)  as picks_with_bans,
    count(*) filter (where s.win)                    as wins,
    sum(s.kills)                                     as kills,
    sum(s.deaths)                                    as deaths,
    sum(s.assists)                                   as assists,
    round((sum(s.kills) + sum(s.assists))::numeric / greatest(sum(s.deaths), 1), 2) as kda,
    round(avg(s.damage_to_champions))                as avg_damage,
    round(avg(s.score), 2)                           as avg_score,
    round(avg(s.kda), 2)                             as avg_kda,
    round(avg(s.dpm))                                as dpm,
    mode() within group (order by s.position)        as position,
    array_agg(distinct s.position) filter (where s.position is not null) as positions
  from public.player_match_stats s
  left join (select distinct match_id from public.match_bans) hb on hb.match_id = s.match_id
  where s.phase is not null
  group by grouping sets (
    (s.tournament_id, s.phase, s.champion),
    (s.tournament_id, s.phase, s.champion, s.matchday, s.round_label),
    (s.tournament_id, s.phase, s.champion, s.group_label),
    (s.tournament_id, s.phase, s.champion, s.group_label, s.matchday, s.round_label),
    (s.tournament_id, s.champion)
  ),
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
    (grouping(c.phase) = 1)                          as all_phases,
    b.champion,
    count(*)                                         as bans
  from public.match_bans b
  join public.match_context c on c.match_id = b.match_id
  -- Annulled matches are excluded here too: unlike `picked`, this reads
  -- `match_context` directly, so it does not inherit the filter
  -- `player_match_stats` applies (0031).
  where c.phase is not null and not coalesce(c.annulled, false)
  group by grouping sets (
    (c.tournament_id, c.phase, b.champion),
    (c.tournament_id, c.phase, b.champion, c.matchday, c.round_label),
    (c.tournament_id, c.phase, b.champion, c.group_label),
    (c.tournament_id, c.phase, b.champion, c.group_label, c.matchday, c.round_label),
    (c.tournament_id, b.champion)
  )
),
scope as (
  select
    c.tournament_id,
    c.phase,
    c.group_label,
    c.matchday,
    c.round_label,
    (grouping(c.group_label) = 1)                    as all_groups,
    (grouping(c.round_label) = 1)                    as all_matchdays,
    (grouping(c.phase) = 1)                          as all_phases,
    count(*)                                         as matches,
    count(*) filter (where hb.match_id is not null)  as matches_with_bans
  from public.match_context c
  left join (select distinct match_id from public.match_bans) hb on hb.match_id = c.match_id
  -- Annulled matches are excluded here too: unlike `picked`, this reads
  -- `match_context` directly, so it does not inherit the filter
  -- `player_match_stats` applies (0031).
  where c.phase is not null and not coalesce(c.annulled, false)
  group by grouping sets (
    (c.tournament_id, c.phase),
    (c.tournament_id, c.phase, c.matchday, c.round_label),
    (c.tournament_id, c.phase, c.group_label),
    (c.tournament_id, c.phase, c.group_label, c.matchday, c.round_label),
    (c.tournament_id)
  )
),
keys as (
  select tournament_id, phase, group_label, matchday, round_label,
         all_groups, all_matchdays, all_phases, champion, role, all_roles from picked
  union
  select tournament_id, phase, group_label, matchday, round_label,
         all_groups, all_matchdays, all_phases, champion, null::text, true from banned
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
  coalesce(p.avg_kda, 0)                             as avg_kda,
  coalesce(p.dpm, 0)                                 as dpm,
  coalesce(p.positions, '{}')                        as positions,
  k.all_roles,

  k.all_phases
from keys k
left join picked p
       on p.tournament_id is not distinct from k.tournament_id
      and p.phase         is not distinct from k.phase
      and p.group_label   is not distinct from k.group_label
      and p.matchday      is not distinct from k.matchday
      and p.round_label   is not distinct from k.round_label
      and p.all_groups    = k.all_groups
      and p.all_matchdays = k.all_matchdays
      and p.all_phases    = k.all_phases
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
      and b.all_phases    = k.all_phases
      and b.champion      = k.champion
left join scope sc
       on sc.tournament_id is not distinct from k.tournament_id
      and sc.phase         is not distinct from k.phase
      and sc.group_label   is not distinct from k.group_label
      and sc.matchday      is not distinct from k.matchday
      and sc.round_label   is not distinct from k.round_label
      and sc.all_groups    = k.all_groups
      and sc.all_matchdays = k.all_matchdays
      and sc.all_phases    = k.all_phases;

-- --- 6. The minimum to appear in a ranking ---------------------------------
--
-- Two games over the whole tournament, one inside a phase or a matchday. A
-- finalist plays up to fifteen games and a team knocked out in the groups four,
-- so a single game is too little to rank someone over the tournament; two still
-- lets a substitute who played well appear, and every ranking prints how many
-- games back the number.
--
-- A new signature rather than a changed one: the old function cannot be dropped
-- while `tournament_mvp` refers to it. Change it here and in
-- `minGamesForAverages()` together, as before: the MVP is computed in Postgres
-- and the averages in the site, and changing only one would apply different
-- rules on the same page.

create or replace function public.mvp_min_games(p_is_total boolean, p_all_phases boolean)
returns integer
language sql
immutable
as $$
  select case when p_all_phases then 2 else 1 end;
$$;

comment on function public.mvp_min_games(boolean, boolean) is
  'Partidas minimas para entrar a un ranking. Unico lugar donde se ajusta el umbral.';

-- --- 7. The MVP ------------------------------------------------------------
--
-- The partition gains `all_phases`, so the tournament rows rank among
-- themselves: that ranking is the MVP of the tournament.

create or replace view public.tournament_mvp with (security_invoker = off) as
select
  t.tournament_id,
  t.phase,
  t.matchday,
  t.round_label,
  t.is_total,
  t.player_id,
  t.player_name,
  t.team_id,
  t.team_name,
  t.team_tag,
  t.university_id,
  t.university_tag,
  t.position,
  t.games,
  t.wins,
  t.kills,
  t.deaths,
  t.assists,
  t.kda,
  t.kill_participation,
  t.avg_score,
  t.mvp_count,
  rank() over (
    partition by t.tournament_id, t.phase, t.matchday, t.round_label, t.is_total, t.all_phases
        order by t.avg_score desc, t.mvp_count desc, t.kda desc, t.player_name asc
  )                                                  as mvp_rank,

  t.all_phases
from public.player_phase_totals t
where t.games >= public.mvp_min_games(t.is_total, t.all_phases);

drop function if exists public.mvp_min_games(boolean);

-- --- 8. What the new column means ------------------------------------------

comment on column public.player_phase_totals.all_phases is
  'true = la fila del torneo entero, con las dos fases juntas. Es la unica que no tiene `is_total`, que sigue siendo la fila de una fase.';
comment on column public.team_phase_totals.all_phases is
  'true = la fila del torneo entero, con las dos fases juntas. Las series de playoffs se cuentan partida por partida.';
comment on column public.university_totals.all_phases is
  'true = la fila del torneo entero, con las dos fases juntas.';
comment on column public.champion_stats.all_phases is
  'true = la fila del torneo entero, con las dos fases juntas.';
comment on column public.champion_meta.all_phases is
  'true = la fila del torneo entero. Solo existe con `all_groups`: una serie de playoffs no pertenece a ningun grupo.';
comment on column public.tournament_mvp.all_phases is
  'true = el ranking del torneo entero, del que sale el MVP de la LIDE.';
