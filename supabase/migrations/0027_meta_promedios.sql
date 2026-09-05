-- ===========================================================================
-- La tabla de campeones muestra promedios, y dos de sus columnas no lo eran.
--
-- QUE MOSTRABA. `champion_meta.kda` es la razon del total: todas las kills y
-- asistencias que hizo el campeon divididas por todas sus muertes. Es la misma
-- cuenta que `player_phase_totals.kda` y tiene el mismo problema cuando se la
-- pone en una tabla al lado de "picks": borra las partidas. Un campeon que en
-- una partida hizo 10/0/10 y en otra 0/10/0 queda en 2.00, igual que uno que
-- hizo 5/5/5 dos veces, y no se jugaron parecido.
--
-- El dano si era un promedio —`avg_damage` es por pick— pero por partida, y
-- una partida de 20 minutos y una de 45 no se comparan: el que jugo la larga
-- pega mas por haber estado mas tiempo, no por pegar mas fuerte. Por minuto
-- eso se normaliza, que es para lo que existe `dpm` en `player_match_stats`.
--
-- Las dos columnas nuevas se promedian sobre los PICKS del campeon, o sea
-- sobre las partidas en las que se jugo. La tabla lo dice arriba, en el
-- renglon de la seccion, porque un promedio sin denominador a la vista es un
-- numero que cada uno interpreta como quiere.
--
-- NO SE TOCA `kda` NI `avg_damage`. Las dos siguen ahi y las siguen usando las
-- tarjetas de /estadisticas: sacar una columna obliga a tirar la vista y a
-- rehacer todo lo que cuelga de ella, y estas dos no estan mal, son otra
-- pregunta. `create or replace view` solo deja AGREGAR columnas al final, asi
-- que las nuevas van despues de `presence` y hay que repetir la definicion
-- entera de 0021_meta_y_bans.sql.
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
    mode() within group (order by s.position)        as position
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
  coalesce(p.dpm, 0)                                 as dpm
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
