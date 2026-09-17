-- ===========================================================================
-- Average KDA: each game's KDA, averaged.
--
-- The existing `kda` is the ratio of totals: (kills + assists) / deaths over the
-- whole scope. It hides individual games: 10/0/10 then 0/10/0 gives 20/10 = 2.00,
-- the same as 5/5/5 twice. Averaged per game, the first is (20 + 0) / 2 = 10.00,
-- because `match_player_scores` divides by `greatest(deaths, 1)`.
--
-- Neither is "the right one": totals reward consistency, averages reward peaks.
-- So `avg_kda` is added next to `kda`, and each stat card says which one it
-- shows.
--
-- Computed here rather than in TypeScript: `loadStats()` reads one aggregated
-- row per player, so per-game KDAs never reach the site.
--
-- `create or replace view` only allows appending columns, so `avg_kda` goes
-- after `mvp_count` and the definition from 0013_publico.sql is repeated.
-- `tournament_mvp` depends on this view and is unaffected.
-- ===========================================================================

create or replace view public.player_phase_totals with (security_invoker = off) as
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
  count(*) filter (where s.match_rank = 1)           as mvp_count,

  -- Each game's KDA, averaged; `kda` is the ratio of totals.
  round(avg(s.kda), 2)                               as avg_kda
from public.player_match_stats s
where s.player_id is not null
group by grouping sets (
  (s.tournament_id, s.phase, s.player_id, s.matchday, s.round_label),
  (s.tournament_id, s.phase, s.player_id)
);
