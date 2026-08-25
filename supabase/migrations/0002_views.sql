-- ===========================================================================
-- Vistas de agregacion: alimentan el listado, el detalle, los leaderboards y
-- las cards de Instagram.
--
-- Todas van con security_invoker para que respeten el RLS de las tablas de
-- abajo (por defecto una vista corre con los permisos del owner y lo saltea).
-- ===========================================================================

-- --- Totales por lado dentro de una partida --------------------------------

create view public.match_team_stats with (security_invoker = on) as
select
  mp.match_id,
  mp.side,
  bool_or(mp.win)                    as win,
  sum(mp.kills)                      as kills,
  sum(mp.deaths)                     as deaths,
  sum(mp.assists)                    as assists,
  sum(mp.gold_earned)                as gold,
  sum(mp.damage_to_champions)        as damage_to_champions,
  sum(mp.damage_taken)               as damage_taken,
  sum(mp.cs)                         as cs,
  sum(mp.vision_score)               as vision_score,
  sum(mp.wards_placed)               as wards_placed,
  sum(mp.turret_takedowns)           as turrets,
  sum(mp.inhibitor_takedowns)        as inhibitors,
  sum(mp.dragon_kills)               as dragons,
  sum(mp.baron_kills)                as barons,
  sum(mp.herald_kills)               as heralds,
  sum(mp.atakhan_kills)              as atakhans,
  sum(mp.void_grub_kills)            as void_grubs,
  -- Los 5 jugadores del lado comparten team_id (o es null): sin max() para uuid,
  -- se agrega por texto.
  max(mp.team_id::text)::uuid        as team_id
from public.match_players mp
group by mp.match_id, mp.side;

-- --- Score de MVP por jugador dentro de la partida --------------------------
--
-- Los pesos estan todos aca a proposito: es el unico lugar a tocar para
-- recalibrar el MVP. La escala no importa, lo que importa es el orden; por eso
-- ademas se expone `score_pct`, normalizado contra el mejor de esa partida.

create view public.match_player_scores with (security_invoker = on) as
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
        3.0  * base.kills
      + 1.5  * base.assists
      - 2.0  * base.deaths
      + 1.2  * (base.damage_to_champions / 1000.0)
      + 0.5  * (base.gold_earned / 1000.0)
      + 0.3  * base.vision_score
      + 1.0  * (base.cs / base.minutes)
      + 1.5  * (base.dragon_kills + base.baron_kills + base.herald_kills
                + base.atakhan_kills + base.turret_takedowns)
      + 15.0 * coalesce(base.kill_participation, 0)
      + case when base.win then 10.0 else 0.0 end
    )::numeric(10, 2)                                                      as score
  from base
)
select
  scored.id as match_player_id,
  scored.match_id,
  scored.side,
  scored.puuid,
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
  round(scored.kda, 2)                                                     as kda,
  round(coalesce(scored.kill_participation, 0), 3)                         as kill_participation,
  round(coalesce(scored.damage_share, 0), 3)                               as damage_share,
  scored.dpm,
  scored.gpm,
  scored.csm,
  scored.score,
  round(scored.score / nullif(max(scored.score) over (partition by scored.match_id), 0), 3)
                                                                           as score_pct,
  rank() over (partition by scored.match_id order by scored.score desc)    as match_rank
from scored;

-- --- Resumen de partida para el listado y las cards ------------------------

create view public.match_summaries with (security_invoker = on) as
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
  (select count(*) from public.match_files mf where mf.match_id = m.id) as file_count
from public.matches m
left join public.teams bt on bt.id = m.blue_team_id
left join public.teams rt on rt.id = m.red_team_id
left join public.match_team_stats blue on blue.match_id = m.id and blue.side = 100
left join public.match_team_stats red  on red.match_id  = m.id and red.side  = 200
left join lateral (
  select * from public.match_player_scores s
  where s.match_id = m.id
  order by s.score desc
  limit 1
) mvp on true;

-- --- Acumulados por jugador -------------------------------------------------
--
-- Se agrupa por PUUID y no por player_id para que sirva incluso antes de que
-- exista el roster: las partidas se suben antes de cargar los equipos.

create view public.player_totals with (security_invoker = on) as
select
  mp.puuid,
  -- Postgres no tiene max() para uuid; el group by es por puuid, que es unico
  -- en players, asi que cualquiera de los dos casts devuelve el unico valor.
  max(p.id::text)::uuid                              as player_id,
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
  count(*) filter (where s.match_rank = 1)           as mvp_count
from public.match_players mp
left join public.players p on p.puuid = mp.puuid
left join public.match_player_scores s on s.match_player_id = mp.id
group by mp.puuid;

create view public.player_champion_totals with (security_invoker = on) as
select
  mp.puuid,
  mp.champion,
  count(*)                        as games,
  count(*) filter (where mp.win)  as wins,
  round(
    (sum(mp.kills) + sum(mp.assists))::numeric / greatest(sum(mp.deaths), 1), 2
  )                               as kda
from public.match_players mp
group by mp.puuid, mp.champion;

-- --- Acumulados por equipo --------------------------------------------------

create view public.team_totals with (security_invoker = on) as
with team_games as (
  select m.blue_team_id as team_id, m.id as match_id, 100 as side,
         (m.winning_side = 100) as win, m.game_length_ms
  from public.matches m where m.blue_team_id is not null
  union all
  select m.red_team_id, m.id, 200,
         (m.winning_side = 200), m.game_length_ms
  from public.matches m where m.red_team_id is not null
)
select
  t.id                                        as team_id,
  t.name,
  t.tag,
  count(g.match_id)                           as games,
  count(*) filter (where g.win)               as wins,
  round(avg(g.game_length_ms) / 60000.0, 1)   as avg_minutes,
  sum(ts.kills)                               as kills,
  sum(ts.deaths)                              as deaths,
  round(avg(ts.gold))                         as avg_gold,
  sum(ts.dragons)                             as dragons,
  sum(ts.barons)                              as barons,
  sum(ts.turrets)                             as turrets
from public.teams t
left join team_games g on g.team_id = t.id
left join public.match_team_stats ts on ts.match_id = g.match_id and ts.side = g.side
group by t.id, t.name, t.tag;
