-- ===========================================================================
-- Filtrar por rol tiene que recortar las estadisticas, no solo las filas.
--
-- 0029 hizo que un campeon muestre todos los roles en los que se jugo y que el
-- filtro lo tome por cualquiera de ellos. Faltaba la otra mitad: al pedir
-- Soporte, la Camille que aparece sigue mostrando los numeros de sus TRES
-- picks —dos de top y uno de support— y no los de su pick de support. El
-- recorte promete un rol y entrega el campeon entero.
--
-- EL ROL PASA A SER UNA DIMENSION, como ya lo son el grupo y la fecha. La vista
-- devuelve, para cada recorte, la fila del campeon entero y una fila por cada
-- rol en el que se jugo; `all_roles` dice cual es cual, igual que `all_groups`
-- y `all_matchdays`. Son los mismos cuatro recortes de antes multiplicados por
-- dos, y Postgres los escribe como el producto de dos `grouping sets` en vez de
-- ocho listas a mano.
--
-- POR QUE NO SE PODIA HACER DEL LADO DE LA APLICACION. Los numeros que hacen
-- falta no son sumas que se puedan repartir: `avg_kda` es el promedio del KDA
-- de cada partida y `dpm` el promedio del dano por minuto. De la fila del
-- campeon entero no se puede sacar la del rol —no hay forma de restar un
-- promedio— asi que o lo agrupa la vista o hay que traerse los picks uno por
-- uno y rehacer las cuentas en TypeScript.
--
-- LOS BANEOS NO TIENEN ROL. Se banea a un campeon, no a una linea: no existe
-- "las veces que se baneo a Camille de support". Asi que `bans`, `ban_rate` y
-- `presence` vienen en NULL en las filas por rol, y no en cero, que es la misma
-- distincion que la vista ya hace con `win_pct` —un campeon con 0 picks no
-- tiene 0% de winrate, no tiene winrate—. La tabla esconde esas tres columnas
-- cuando hay un rol elegido.
--
-- `pick_rate` SI SIGUE. Es picks sobre partidas del recorte, y el denominador
-- no cambia: "en que porcentaje de las partidas se eligio a Camille de
-- support" es una pregunta con respuesta.
--
-- `champion_stats` NO SE TOCA. Es la de las tarjetas de /estadisticas, que no
-- tienen filtro por rol: agregarle la dimension serian el doble de filas que no
-- lee nadie. Con `positions` de 0029 le alcanza para nombrar los roles.
--
-- `create or replace view` solo deja AGREGAR columnas al final, asi que
-- `all_roles` queda ultima aunque por sentido vaya al lado de `all_groups`, y
-- hay que repetir la definicion entera de 0029_roles_por_campeon.sql.
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
    -- El rol como clave de agrupamiento. Es `s.position` a secas: en los
    -- conjuntos donde no agrupa, viene NULL, y `all_roles` es lo que separa ese
    -- NULL del de un pick al que no se le resolvio la linea.
    s.position                                       as role,
    (grouping(s.position) = 1)                       as all_roles,
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
  ),
  -- Y cada uno de esos cuatro, dos veces: el campeon entero y el campeon en
  -- cada rol. Postgres multiplica los dos `grouping sets`, asi que son ocho
  -- escrito una vez.
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
         all_groups, all_matchdays, champion, role, all_roles from picked
  union
  -- Un baneo no tiene rol: se banea al campeon. Sus filas entran solo del lado
  -- de `all_roles`, que es donde la pregunta "cuanto se baneo" tiene sentido.
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
  -- Las tres tasas, todas NULL cuando su denominador es cero. Un campeon con
  -- 0 picks no tiene 0% de winrate: no tiene winrate.
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
  -- Al final porque `create or replace view` solo deja agregar ahi.
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
