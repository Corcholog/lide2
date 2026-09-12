-- ===========================================================================
-- Un campeon se juega en mas de un rol, y la tabla mostraba uno solo.
--
-- `position` es un `mode()`: el rol en el que MAS veces se jugo el campeon. Con
-- eso, Camille —jugada de top y de support— sale como "Top" y nada mas. No es
-- redondeo: es la mitad del dato faltando, y encima la mitad que el filtro por
-- rol usa para decidir que filas se ven, asi que al filtrar por Soporte esa
-- Camille no aparecia en ningun lado.
--
-- LO QUE SE AGREGA es la lista completa: todos los roles en los que se jugo.
-- `position` se queda al lado y sigue siendo el principal —el que mas veces
-- se jugo— que es lo que ordena la columna y lo que la interfaz pone primero
-- cuando escribe "Top, Soporte".
--
-- SIN ORDENAR, a proposito. `array_agg(distinct ...)` devuelve el conjunto y no
-- una secuencia con sentido: el orden en que se leen los roles —el principal
-- primero, despues los demas en orden de linea, TOP JUNGLE MID ADC SUP— es una
-- convencion de la interfaz y ya vive ahi, en `ROLES` de format.ts. Repetirla
-- en SQL serian dos lugares donde arreglarla.
--
-- LAS ESTADISTICAS NO SE PARTEN POR ROL. Los numeros de un campeon siguen
-- siendo los de todos sus picks juntos, que es lo que se pidio y ademas lo
-- unico que mantiene comparables las tasas: el pick rate se mide contra todas
-- las partidas del recorte, y partirlo por rol daria cuatro denominadores
-- distintos para la misma pregunta.
--
-- LAS DOS VISTAS, no una. `champion_meta` es la de la tabla de /estadisticas/
-- tablas y es la que se reporto; `champion_stats` es la de las tarjetas de
-- /estadisticas, y tiene el mismo `mode()` abajo del mismo rotulo. Arreglar una
-- sola deja el sitio diciendo "Top" en una pantalla y "Top, Soporte" en la otra
-- sobre el mismo campeon.
--
-- `create or replace view` solo deja AGREGAR columnas al final, asi que la
-- columna nueva va ultima y hay que repetir las dos definiciones enteras
-- —`champion_meta` de 0027_meta_promedios.sql y `champion_stats` de
-- 0013_publico.sql—. Lo unico que cambia en cada una son esas dos lineas.
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
    count(*)                                         as picks,
    -- Los picks que pasaron por una partida con draft cargado. Es el numerador
    -- de `presence` y no `picks` a secas: si un campeon se jugo diez veces
    -- pero solo tres partidas tienen los bans, mezclarlos daria una presencia
    -- mayor a 1.
    count(*) filter (where hb.match_id is not null)  as picks_with_bans,
    count(*) filter (where s.win)                    as wins,
    sum(s.kills)                                     as kills,
    sum(s.deaths)                                    as deaths,
    sum(s.assists)                                   as assists,
    round((sum(s.kills) + sum(s.assists))::numeric / greatest(sum(s.deaths), 1), 2) as kda,
    round(avg(s.damage_to_champions))                as avg_damage,
    round(avg(s.score), 2)                           as avg_score,
    -- El KDA de cada partida, promediado, y el dano por minuto. Ver el
    -- comentario de arriba: `kda` de aca al lado es la razon del total.
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
  )
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
-- El denominador de las tres tasas: cuantas partidas tiene el recorte, y de
-- esas cuantas tienen el draft cargado.
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
-- La union es lo que hace que un campeon que se baneo siempre y no se jugo
-- nunca aparezca igual en la tabla. Sin esto el meta diria que no existe,
-- cuando en realidad es el mas respetado del torneo.
keys as (
  select tournament_id, phase, group_label, matchday, round_label,
         all_groups, all_matchdays, champion from picked
  union
  select tournament_id, phase, group_label, matchday, round_label,
         all_groups, all_matchdays, champion from banned
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
  coalesce(b.bans, 0)                                as bans,
  sc.matches,
  coalesce(sc.matches_with_bans, 0)                  as matches_with_bans,
  -- Las tres tasas, todas NULL cuando su denominador es cero. Un campeon con
  -- 0 picks no tiene 0% de winrate: no tiene winrate.
  round(coalesce(p.picks, 0)::numeric / nullif(sc.matches, 0), 3) as pick_rate,
  case
    when coalesce(sc.matches_with_bans, 0) > 0
    then round(coalesce(b.bans, 0)::numeric / sc.matches_with_bans, 3)
  end                                                as ban_rate,
  case
    when coalesce(sc.matches_with_bans, 0) > 0
    then round(
      (coalesce(p.picks_with_bans, 0) + coalesce(b.bans, 0))::numeric / sc.matches_with_bans, 3)
  end                                                as presence,
  -- Al final porque `create or replace view` solo deja agregar ahi.
  coalesce(p.avg_kda, 0)                             as avg_kda,
  coalesce(p.dpm, 0)                                 as dpm,
  coalesce(p.positions, '{}')                        as positions
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
left join banned b
       on b.tournament_id is not distinct from k.tournament_id
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

create or replace view public.champion_stats with (security_invoker = off) as
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
    mode() within group (order by s.position)        as position,
    array_agg(distinct s.position) filter (where s.position is not null) as positions
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
  end                                                as presence,
  coalesce(p.positions, '{}')                        as positions
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

comment on column public.champion_meta.positions is
  'Todos los roles en los que se jugo el campeon, sin orden. `position` es el principal.';
comment on column public.champion_stats.positions is
  'Todos los roles en los que se jugo el campeon, sin orden. `position` es el principal.';
