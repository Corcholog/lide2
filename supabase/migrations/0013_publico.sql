-- ===========================================================================
-- Opening the site to the public.
--
-- 1. The publishable key is sent to the browser, so anyone can query PostgREST
--    directly. What must stay hidden has to be closed in the database, not in
--    the frontend.
--
-- 2. Views become the public API. They were created with
--    `security_invoker = on`, which would require giving `anon` access to the
--    raw tables, and those hold columns that must not be exposed
--    (`match_players.puuid`, `match_players.raw` with the PUUID inside,
--    `matches.raw_metadata`, `players.puuid`). So raw tables stay closed to
--    `anon` and public views run with their owner's permissions. A view's
--    column list is the contract: what it lists is public.
--
-- Never exposed, by view or table:
--
--   puuid              identifies the account against Riot's API
--   raw / raw_metadata the raw JSON, which contains the puuid
--   team_roster        real people's legal names
--   match_files        storage paths of the .rofl files
--   ingest_failures    file names and internal errors
-- ===========================================================================

-- --- 1. Remove the PUUID from the views ------------------------------------
--
-- `create or replace view` cannot drop a column, so the view stack is dropped
-- and recreated; the cascade takes match_summaries, player_totals,
-- player_match_stats and their dependents.
--
-- A player's identity becomes `players.id`, just as stable (one row per puuid,
-- created by ingestion before match_players), but useless for querying Riot.

drop view if exists public.match_player_scores cascade;
drop view if exists public.player_champion_totals cascade;

create view public.match_player_scores with (security_invoker = off) as
with team_agg as (
  select match_id, side,
         sum(kills)               as team_kills,
         sum(damage_to_champions) as team_damage
  from public.match_players
  group by match_id, side
),
base as (
  select
    mp.*,
    m.game_length_ms,
    greatest(m.game_length_ms / 60000.0, 1)                                as minutes,
    t.team_kills,
    t.team_damage,
    (mp.kills + mp.assists)::numeric / nullif(t.team_kills, 0)             as kill_participation,
    mp.damage_to_champions::numeric / nullif(t.team_damage, 0)             as damage_share,
    (mp.kills + mp.assists)::numeric / greatest(mp.deaths, 1)              as kda
  from public.match_players mp
  join public.matches m on m.id = mp.match_id
  join team_agg t on t.match_id = mp.match_id and t.side = mp.side
),
scored as (
  select
    base.*,
    round(base.damage_to_champions / base.minutes)                         as dpm,
    round(base.gold_earned / base.minutes)                                 as gpm,
    round((base.cs / base.minutes)::numeric, 1)                            as csm,
    (
        1.0  * least(base.kda, 7.0)                     -- MVP_KDA_WEIGHT / MVP_KDA_CAP
      + 10.0 * coalesce(base.kill_participation, 0)     -- MVP_KP_WEIGHT (0..1)
      + 2.0  * coalesce(base.damage_share, 0)           -- MVP_DAMAGE_WEIGHT (0..1)
      + case when base.win then 2.0 else 0.0 end        -- MVP_WIN_BONUS
    )::numeric(10, 2)                                                      as score
  from base
)
select
  scored.id as match_player_id,
  scored.match_id,
  scored.side,
  scored.player_id,
  scored.team_id,
  scored.riot_game_name,
  scored.riot_tag_line,
  scored.champion,
  scored.position,
  scored.win,
  scored.kills,
  scored.deaths,
  scored.assists,
  scored.cs,
  scored.gold_earned,
  scored.damage_to_champions,
  scored.vision_score,
  -- Items and spells, previously read from match_players, which is no longer
  -- public. They belong to the scoreboard anyway.
  scored.items,
  scored.summoner_spell_1,
  scored.summoner_spell_2,
  round(scored.kda, 2)                                                     as kda,
  round(coalesce(scored.kill_participation, 0), 3)                         as kill_participation,
  round(coalesce(scored.damage_share, 0), 3)                               as damage_share,
  scored.dpm,
  scored.gpm,
  scored.csm,
  scored.score,
  round(scored.score / nullif(max(scored.score) over (partition by scored.match_id), 0), 3)
                                                                           as score_pct,
  -- The tiebreak used puuid, now gone. `id` (the match_players row) is unique
  -- within the match, which keeps the order total.
  rank() over (
    partition by scored.match_id
        order by scored.score desc,
                 scored.kills desc,
                 scored.damage_to_champions desc,
                 scored.id
  )                                                                        as match_rank
from scored;

create view public.match_summaries with (security_invoker = off) as
select
  m.id,
  m.played_at,
  m.patch,
  m.game_length_ms,
  m.stage_label,
  m.round_label,
  m.riot_match_id,
  m.winning_side,
  m.ended_in_surrender,
  m.blue_team_id,
  bt.name                as blue_team_name,
  m.red_team_id,
  rt.name                as red_team_name,
  blue.kills             as blue_kills,
  blue.gold              as blue_gold,
  red.kills              as red_kills,
  red.gold               as red_gold,
  mvp.riot_game_name     as mvp_name,
  mvp.champion           as mvp_champion,
  mvp.kills              as mvp_kills,
  mvp.deaths             as mvp_deaths,
  mvp.assists            as mvp_assists,
  mvp.score              as mvp_score,
  (select count(*) from public.match_files mf where mf.match_id = m.id) as file_count,
  m.tournament_id,
  m.series_id,
  m.game_number,
  bt.logo_url            as blue_team_logo,
  rt.logo_url            as red_team_logo
from public.matches m
left join public.teams bt on bt.id = m.blue_team_id
left join public.teams rt on rt.id = m.red_team_id
left join public.match_team_stats blue on blue.match_id = m.id and blue.side = 100
left join public.match_team_stats red  on red.match_id  = m.id and red.side  = 200
left join lateral (
  select * from public.match_player_scores s
  where s.match_id = m.id and s.match_rank = 1
) mvp on true;

-- Aggregates now group by player_id. Rows without a player are dropped: there
-- should be none (ingestion creates `players` rows first), and grouping them as
-- "no player" would be worse.

create view public.player_totals with (security_invoker = off) as
select
  mp.player_id,
  max(mp.riot_game_name)                             as riot_game_name,
  max(mp.riot_tag_line)                              as riot_tag_line,
  max(p.display_name)                                as display_name,
  max(mp.team_id::text)::uuid                        as team_id,
  count(*)                                           as games,
  count(*) filter (where mp.win)                     as wins,
  round(avg(mp.kills), 2)                            as avg_kills,
  round(avg(mp.deaths), 2)                           as avg_deaths,
  round(avg(mp.assists), 2)                          as avg_assists,
  round(
    (sum(mp.kills) + sum(mp.assists))::numeric / greatest(sum(mp.deaths), 1), 2
  )                                                  as kda,
  sum(mp.kills)                                      as kills,
  sum(mp.deaths)                                     as deaths,
  sum(mp.assists)                                    as assists,
  round(avg(mp.cs), 1)                               as avg_cs,
  round(avg(mp.gold_earned))                         as avg_gold,
  round(avg(mp.damage_to_champions))                 as avg_damage,
  round(avg(mp.vision_score), 1)                     as avg_vision,
  sum(mp.penta_kills)                                as penta_kills,
  sum(mp.quadra_kills)                               as quadra_kills,
  round(avg(s.score), 2)                             as avg_score,
  count(*) filter (where s.match_rank = 1)           as mvp_count,
  m.tournament_id
from public.match_players mp
join public.matches m on m.id = mp.match_id
left join public.players p on p.id = mp.player_id
left join public.match_player_scores s on s.match_player_id = mp.id
where mp.player_id is not null
group by mp.player_id, m.tournament_id;

create view public.player_champion_totals with (security_invoker = off) as
select
  mp.player_id,
  mp.champion,
  count(*)                        as games,
  count(*) filter (where mp.win)  as wins,
  round(
    (sum(mp.kills) + sum(mp.assists))::numeric / greatest(sum(mp.deaths), 1), 2
  )                               as kda,
  m.tournament_id
from public.match_players mp
join public.matches m on m.id = mp.match_id
where mp.player_id is not null
group by mp.player_id, mp.champion, m.tournament_id;

-- NESTED VIEWS. `security_invoker` checks against the querying user, and that is
-- still the visitor even when the view is read from inside an owner-permission
-- view; it is not inherited. A mixed chain returns zero rows to visitors without
-- any error. So every view in a public chain runs with owner permissions,
-- intermediate ones included; none exposes puuid or raw JSON.

create view public.player_match_stats with (security_invoker = off) as
select
  mp.id                                             as match_player_id,
  mp.match_id,
  c.tournament_id,
  c.phase,
  c.group_label,
  c.matchday,
  c.slot,
  c.round_label,
  m.played_at,
  m.game_length_ms,
  round(greatest(m.game_length_ms / 60000.0, 1)::numeric, 2) as minutes,
  m.ended_in_surrender,

  mp.side,
  mp.player_id,
  coalesce(p.display_name, mp.riot_game_name)       as player_name,
  mp.team_id,
  t.name                                            as team_name,
  t.tag                                             as team_tag,
  t.logo_url                                        as team_logo,
  t.group_label                                     as team_group_label,
  u.id                                              as university_id,
  u.tag                                             as university_tag,
  u.name                                            as university_name,
  u.logo_url                                        as university_logo,

  mp.champion,
  mp.position,
  mp.win,
  mp.kills,
  mp.deaths,
  mp.assists,
  mp.cs,
  mp.gold_earned,
  mp.damage_to_champions,
  mp.damage_taken,
  mp.damage_mitigated,
  mp.total_heal,
  mp.heal_on_teammates,
  mp.shielded_on_teammates,
  mp.vision_score,
  mp.wards_placed,
  mp.wards_killed,
  mp.control_wards_bought,
  mp.turret_takedowns,
  mp.dragon_kills,
  mp.baron_kills,
  mp.herald_kills,
  mp.objectives_stolen,
  mp.largest_killing_spree,
  mp.largest_multi_kill,
  mp.double_kills,
  mp.triple_kills,
  mp.quadra_kills,
  mp.penta_kills,
  mp.time_ccing_others,
  mp.total_time_spent_dead,

  s.kda,
  s.kill_participation,
  s.damage_share,
  s.dpm,
  s.gpm,
  s.csm,
  s.score,
  s.score_pct,
  s.match_rank
from public.match_players mp
join public.matches m on m.id = mp.match_id
left join public.match_context c on c.match_id = mp.match_id
left join public.match_player_scores s on s.match_player_id = mp.id
left join public.players p on p.id = mp.player_id
left join public.teams t on t.id = mp.team_id
left join public.universities u on u.id = public.player_university_id(mp.player_id, mp.team_id);

create view public.player_phase_totals with (security_invoker = off) as
select
  s.tournament_id,
  s.phase,
  s.matchday,
  s.round_label,
  (grouping(s.round_label) = 1)                      as is_total,

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
  count(*) filter (where s.match_rank = 1)           as mvp_count
from public.player_match_stats s
where s.player_id is not null
group by grouping sets (
  (s.tournament_id, s.phase, s.player_id, s.matchday, s.round_label),
  (s.tournament_id, s.phase, s.player_id)
);

create view public.university_totals with (security_invoker = off) as
select
  s.tournament_id,
  s.phase,
  s.matchday,
  s.round_label,
  (grouping(s.round_label) = 1)                      as is_total,

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
  round(avg(s.score), 2)                             as avg_score
from public.player_match_stats s
where s.university_id is not null
group by grouping sets (
  (s.tournament_id, s.phase, s.university_id, s.matchday, s.round_label),
  (s.tournament_id, s.phase, s.university_id)
);

create view public.champion_stats with (security_invoker = off) as
with picked as (
  select
    s.tournament_id,
    s.phase,
    s.matchday,
    s.round_label,
    (grouping(s.round_label) = 1)                    as is_total,
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
    mode() within group (order by s.position)        as position
  from public.player_match_stats s
  left join (select distinct match_id from public.match_bans) hb on hb.match_id = s.match_id
  group by grouping sets (
    (s.tournament_id, s.phase, s.champion, s.matchday, s.round_label),
    (s.tournament_id, s.phase, s.champion)
  )
),
banned as (
  select
    c.tournament_id,
    c.phase,
    c.matchday,
    c.round_label,
    (grouping(c.round_label) = 1)                    as is_total,
    b.champion,
    count(*)                                         as bans
  from public.match_bans b
  join public.match_context c on c.match_id = b.match_id
  group by grouping sets (
    (c.tournament_id, c.phase, b.champion, c.matchday, c.round_label),
    (c.tournament_id, c.phase, b.champion)
  )
),
scope as (
  select
    c.tournament_id,
    c.phase,
    c.matchday,
    c.round_label,
    (grouping(c.round_label) = 1)                    as is_total,
    count(*)                                         as matches,
    count(*) filter (where hb.match_id is not null)  as matches_with_bans
  from public.match_context c
  left join (select distinct match_id from public.match_bans) hb on hb.match_id = c.match_id
  group by grouping sets (
    (c.tournament_id, c.phase, c.matchday, c.round_label),
    (c.tournament_id, c.phase)
  )
),
keys as (
  select tournament_id, phase, matchday, round_label, is_total, champion from picked
  union
  select tournament_id, phase, matchday, round_label, is_total, champion from banned
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
  end                                                as presence
from keys k
left join picked p
       on p.tournament_id is not distinct from k.tournament_id
      and p.phase         is not distinct from k.phase
      and p.matchday      is not distinct from k.matchday
      and p.round_label   is not distinct from k.round_label
      and p.is_total      = k.is_total
      and p.champion      = k.champion
left join banned b
       on b.tournament_id is not distinct from k.tournament_id
      and b.phase         is not distinct from k.phase
      and b.matchday      is not distinct from k.matchday
      and b.round_label   is not distinct from k.round_label
      and b.is_total      = k.is_total
      and b.champion      = k.champion
left join scope sc
       on sc.tournament_id is not distinct from k.tournament_id
      and sc.phase         is not distinct from k.phase
      and sc.matchday      is not distinct from k.matchday
      and sc.round_label   is not distinct from k.round_label
      and sc.is_total      = k.is_total;

create view public.tournament_mvp with (security_invoker = off) as
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
    partition by t.tournament_id, t.phase, t.matchday, t.round_label, t.is_total
        order by t.avg_score desc, t.mvp_count desc, t.kda desc, t.player_name asc
  )                                                  as mvp_rank
from public.player_phase_totals t
where t.games >= public.mvp_min_games(t.is_total);

-- --- 2. Player profile without puuid ---------------------------------------
--
-- `players` is no longer readable without a session because its key is the
-- puuid. This is the public part of an account: its name and when it was seen.

create view public.player_profiles with (security_invoker = off) as
select
  p.id                                       as player_id,
  coalesce(p.display_name, p.riot_game_name) as name,
  p.riot_game_name,
  p.riot_tag_line,
  p.display_name,
  p.last_seen_at
from public.players p;

comment on view public.player_profiles is
  'Lo publico de una cuenta de Riot. Sin puuid: eso no sale de la base.';

-- --- 3. The other public views ---------------------------------------------
--
-- Changing the option is enough; none of these exposes puuid or raw JSON.

alter view public.match_team_stats     set (security_invoker = false);
alter view public.team_totals          set (security_invoker = false);
alter view public.group_standings      set (security_invoker = false);
alter view public.series_results       set (security_invoker = false);
alter view public.fixture_results      set (security_invoker = false);
alter view public.fixture_byes         set (security_invoker = false);
alter view public.team_phase_totals    set (security_invoker = false);
alter view public.match_records        set (security_invoker = false);
alter view public.team_accounts        set (security_invoker = false);

-- Intermediate views too (see the note on nested views above): if they stayed
-- invoker, every view built on them would return zero rows to visitors.
alter view public.match_context        set (security_invoker = false);
alter view public.team_match_results   set (security_invoker = false);
alter view public.team_standings       set (security_invoker = false);

-- These two stay invoker on purpose: they read tables with no `anon` policy, so
-- visitors see zero rows and signed-in users see everything.
--
--   roster_status        signups' legal names.
--   unassigned_matches   the panel's queue.

-- --- 4. Anonymous read access ----------------------------------------------
--
-- Only tables with nothing to hide. The missing ones are left out on purpose:
-- matches, match_players and players (puuid or raw JSON), match_files (storage
-- paths), team_roster (legal names), ingest_failures (internal errors). Those
-- are reached through the views above.

create policy "lectura publica" on public.tournaments       for select to anon using (true);
create policy "lectura publica" on public.teams             for select to anon using (true);
create policy "lectura publica" on public.universities      for select to anon using (true);
create policy "lectura publica" on public.stages            for select to anon using (true);
create policy "lectura publica" on public.series            for select to anon using (true);
create policy "lectura publica" on public.fixtures          for select to anon using (true);
create policy "lectura publica" on public.team_universities for select to anon using (true);
create policy "lectura publica" on public.match_bans        for select to anon using (true);
