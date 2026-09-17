-- ===========================================================================
-- Standings.
--
-- Stage and round travel as text in matches.stage_label ("Bloque B") and
-- matches.round_label ("Fecha 3"), derived from the file name on upload
-- (src/lib/ingest/labels.ts). These views group by those labels, so they work
-- for any tournament format.
--
-- Only matches with both teams linked and a winner count: until rosters are
-- loaded, blue_team_id and red_team_id are null and the match counts for no
-- one.
-- ===========================================================================

-- --- One row per team and match --------------------------------------------
--
-- Turns a match (blue/red) into "team vs opponent", as standings and team
-- pages read it. matches.blue_team_id / red_team_id, written by
-- relink_all_matches(), are the source of truth for who played.

create view public.team_match_results with (security_invoker = on) as
with sides as (
  select m.id as match_id, m.blue_team_id as team_id, m.red_team_id as opponent_team_id,
         100::smallint as side, 200::smallint as opponent_side
    from public.matches m
   where m.blue_team_id is not null
  union all
  select m.id, m.red_team_id, m.blue_team_id,
         200::smallint, 100::smallint
    from public.matches m
   where m.red_team_id is not null
)
select
  s.match_id,
  s.team_id,
  t.name                     as team_name,
  t.tag                      as team_tag,
  s.opponent_team_id,
  o.name                     as opponent_name,
  s.side,
  m.stage_label,
  m.round_label,
  m.played_at,
  m.game_length_ms,
  m.ended_in_surrender,
  (m.winning_side = s.side)  as win,
  coalesce(own.kills, 0)     as kills,
  coalesce(rival.kills, 0)   as kills_against,
  coalesce(own.gold, 0)      as gold,
  coalesce(rival.gold, 0)    as gold_against,
  coalesce(own.dragons, 0)   as dragons,
  coalesce(own.barons, 0)    as barons,
  coalesce(own.turrets, 0)   as turrets
from sides s
join public.matches m on m.id = s.match_id
join public.teams t on t.id = s.team_id
left join public.teams o on o.id = s.opponent_team_id
left join public.match_team_stats own   on own.match_id   = s.match_id and own.side   = s.side
left join public.match_team_stats rival on rival.match_id = s.match_id and rival.side = s.opponent_side;

-- --- Standings per stage ---------------------------------------------------
--
-- Tiebreak: more wins, fewer losses (teams may have played different numbers
-- of matches), kill difference, and finally the name for a stable order.
--
-- `form` holds the last five results, newest first.

create view public.team_standings with (security_invoker = on) as
select
  r.stage_label,
  r.team_id,
  r.team_name,
  r.team_tag,
  count(*)                                                     as games,
  count(*) filter (where r.win)                                as wins,
  count(*) filter (where not r.win)                            as losses,
  round(count(*) filter (where r.win)::numeric / count(*), 3)  as win_pct,
  sum(r.kills)                                                 as kills,
  sum(r.kills_against)                                         as kills_against,
  sum(r.kills) - sum(r.kills_against)                          as kill_diff,
  sum(r.gold) - sum(r.gold_against)                            as gold_diff,
  round(avg(r.game_length_ms) / 60000.0, 1)                    as avg_minutes,
  min(r.played_at)                                             as first_played_at,
  max(r.played_at)                                             as last_played_at,
  (array_agg(r.win order by r.played_at desc nulls last, r.match_id))[1:5] as form,
  rank() over (
    partition by r.stage_label
        order by count(*) filter (where r.win) desc,
                 count(*) filter (where not r.win) asc,
                 sum(r.kills) - sum(r.kills_against) desc,
                 r.team_name asc
  )                                                            as position
from public.team_match_results r
-- With only one side linked the row still exists (for the team's history), but
-- it is excluded here: within a stage, total wins must equal total losses.
where r.win is not null and r.opponent_team_id is not null
group by r.stage_label, r.team_id, r.team_name, r.team_tag;
