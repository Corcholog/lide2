-- ===========================================================================
-- Group standings break ties by head to head, not kill difference.
--
-- The rulebook (2.2): the two teams with the most points in each group qualify,
-- level teams are separated by head to head, and anything unresolved is decided
-- by the organizers. Kill difference is not in the rulebook; it was a stand-in
-- since 0007. The home page projects the bracket with head to head, so the
-- table must use the same rule or the page contradicts itself on ties.
--
-- How: for each team, wins against the teams level with it. With two teams that
-- is the game between them; with three or more, a mini league of their mutual
-- games.
--
-- Unresolved: three teams each beating the next get one win each. The rulebook
-- leaves that to the organizers; the view still needs an order, so the name is
-- the last criterion (a display order, not a ruling). The bracket projection
-- leaves such slots open.
--
-- `kill_diff` stays as a displayed column; it just no longer decides the order.
-- `team_standings` (0005) is not changed, as in 0024.
-- ===========================================================================

create or replace view public.group_standings with (security_invoker = on) as
with resultados as (
  -- Played results, as in 0024.
  select r.team_id,
         r.match_id,
         r.win,
         r.kills,
         r.kills_against,
         r.gold,
         r.gold_against,
         r.game_length_ms,
         r.played_at,
         c.group_label
    from public.team_match_results r
    join public.match_context c on c.match_id = r.match_id
   where r.win is not null
     and r.opponent_team_id is not null
     and c.phase = 'grupos'
  union all
  select w.team_id,
         null::uuid,
         w.win,
         0, 0, 0, 0,
         null::integer,
         w.kickoff,
         w.group_label
    from (
      select f.walkover_team_id as team_id, true as win, f.kickoff, f.group_label
        from public.fixtures f
       where f.walkover_team_id is not null
      union all
      select case when f.walkover_team_id = f.team_a_id then f.team_b_id else f.team_a_id end,
             false, f.kickoff, f.group_label
        from public.fixtures f
       where f.walkover_team_id is not null
    ) w
),

-- New: who beat whom. Only wins; the loss is the same row seen from the other
-- side.
--
-- Walkovers count like played games: the absent team lost the matchup, head to
-- head included.
duelos as (
  select r.team_id,
         r.opponent_team_id,
         c.group_label
    from public.team_match_results r
    join public.match_context c on c.match_id = r.match_id
   where r.win
     and r.opponent_team_id is not null
     and c.phase = 'grupos'
  union all
  select f.walkover_team_id,
         case when f.walkover_team_id = f.team_a_id then f.team_b_id else f.team_a_id end,
         f.group_label
    from public.fixtures f
   where f.walkover_team_id is not null
),

-- The standings without positions. Split in two because the tiebreak needs the
-- summed records to know which teams are level.
tabla as (
  select
    t.tournament_id,
    t.group_label,
    t.id                                as team_id,
    t.name                              as team_name,
    t.tag                               as team_tag,
    t.logo_url                          as team_logo,
    u.id                                as university_id,
    u.name                              as university_name,
    u.tag                               as university_tag,
    u.logo_url                          as university_logo,
    count(r.win)                                             as games,
    count(*) filter (where r.win)                            as wins,
    count(*) filter (where not r.win)                        as losses,
    coalesce(sum(r.kills), 0)                                as kills,
    coalesce(sum(r.kills_against), 0)                        as kills_against,
    coalesce(sum(r.kills) - sum(r.kills_against), 0)         as kill_diff,
    coalesce(sum(r.gold) - sum(r.gold_against), 0)           as gold_diff,
    round(avg(r.game_length_ms) / 60000.0, 1)                as avg_minutes,
    max(r.played_at)                                         as last_played_at,
    (array_remove(array_agg(r.win order by r.played_at desc nulls last, r.match_id), null))[1:5]
                                                             as form
  from public.teams t
  left join public.universities u on u.id = t.university_id
  left join resultados r on r.team_id = t.id and r.group_label = t.group_label
  where t.group_label is not null
  group by t.tournament_id, t.group_label, t.id, t.name, t.tag, t.logo_url,
           u.id, u.name, u.tag, u.logo_url
),

-- The tiebreak: wins against teams level on both wins AND losses.
--
-- Losses are included because mid-phase two teams can have equal wins with
-- different games played, and then the earlier criterion already separates
-- them.
--
-- Tied teams count against the same set (those sharing the record), so their
-- numbers are comparable and usable as an `order by` column.
mano_a_mano as (
  select tb.team_id,
         (select count(*)
            from duelos d
            join tabla o
              on o.team_id = d.opponent_team_id
             and o.group_label = tb.group_label
             and o.tournament_id is not distinct from tb.tournament_id
           where d.team_id = tb.team_id
             and d.group_label = tb.group_label
             and o.wins = tb.wins
             and o.losses = tb.losses)                       as wins_vs_level
    from tabla tb
)

select
  tb.tournament_id,
  tb.group_label,
  tb.team_id,
  tb.team_name,
  tb.team_tag,
  tb.team_logo,
  tb.university_id,
  tb.university_name,
  tb.university_tag,
  tb.university_logo,
  tb.games,
  tb.wins,
  tb.losses,
  tb.kills,
  tb.kills_against,
  tb.kill_diff,
  tb.gold_diff,
  tb.avg_minutes,
  tb.last_played_at,
  tb.form,
  rank() over (
    partition by tb.tournament_id, tb.group_label
        order by tb.wins desc,
                 tb.losses asc,
                 mm.wins_vs_level desc,
                 tb.team_name asc
  )                                                          as position,
  public.team_university_tags(tb.team_id)                    as university_tags
from tabla tb
join mano_a_mano mm on mm.team_id = tb.team_id;

comment on view public.group_standings is
  'La tabla de cada grupo. Ordena por victorias y desempata por el enfrentamiento directo, como el reglamento; la diferencia de kills se muestra pero no decide.';
