-- ===========================================================================
-- LIDE 2: motor de estadisticas
--
-- Tres cosas cambiaron respecto de como estaba pensado esto antes de que la
-- organizacion publicara los datos oficiales, y las tres estan resueltas aca:
--
--   1. LA FECHA YA NO SALE DEL NOMBRE DEL ARCHIVO.
--      Hasta ahora la jornada era texto en matches.round_label, derivado de la
--      carpeta donde el equipo guardo el .rofl (src/lib/ingest/labels.ts). Eso
--      alcanzaba cuando no habia calendario. Ahora el fixture completo esta
--      publicado y cargado en `fixtures`: el cruce sabe su grupo, su fecha y su
--      turno desde antes de jugarse. La partida hereda el contexto del cruce al
--      que se engancha, y el nombre del archivo pasa a ser el ultimo recurso.
--      Eso vive en `match_context`, y todo lo demas cuelga de ahi.
--
--   2. LA UNIVERSIDAD SE ATRIBUYE POR JUGADOR, NO POR EQUIPO.
--      Cuatro equipos (13, 15, 16 y 17) salieron de inscripciones individuales
--      y mezclan hasta tres universidades. Sumarle a UNER todo lo que hace el
--      Equipo 15 seria contarle partidas a gente de UADE y de UNLP. La
--      atribucion va por persona, cruzando team_roster con players, y cae en la
--      universidad principal del equipo mientras ese cruce no exista: la tabla
--      arranca aproximada y se vuelve exacta sola a medida que alguien empareje
--      inscriptos con cuentas de Riot, sin rehacer nada.
--
--   3. SON 3 FECHAS EN 5 TURNOS, NO 3 PARTIDOS.
--      Cada equipo juega 4 partidos repartidos en 5 turnos (descansa uno) y las
--      fechas 1 y 2 tienen dos turnos cada una. Asi que "por fecha" y "por
--      partido" no son lo mismo, y el minimo de partidas para entrar al MVP
--      depende de que se este mirando.
--
-- Todas las vistas de acumulados traen la fila por fecha Y la fila acumulada en
-- la misma consulta, con `grouping sets`. `is_total` distingue una de otra: sin
-- esa bandera, el acumulado (matchday null) se confundiria con una partida a la
-- que todavia no se le pudo resolver la fecha.
-- ===========================================================================

-- --- 1. El MVP se recalibra: aporte, no farmeo ------------------------------
--
-- El score viejo pesaba dano, oro y CS, asi que el MVP era casi siempre el ADC
-- o el mid: un soporte no puede competir en esas tres. La formula nueva pesa
-- sobre todo cuanto del juego de tu equipo paso por vos, que es algo que puede
-- ganar cualquier rol.
--
-- Sobre el techo del KDA, que es el numero delicado de todo esto: el KDA divide
-- por `greatest(deaths, 1)`, asi que un partido sin muertes vale el doble que
-- uno con una sola. Sin techo bajo, el MVP se lo lleva el que menos se jugo.
-- Probado contra el unico replay real que hay cargado (fixtures/), con techo 15
-- ganaba un top 6/0/8 con 23k de dano por encima de un mid 17/4/9 con 45k y el
-- 81% de participacion. Con techo 7 el orden queda Yasuo (17/4/9), Fiddlesticks
-- (7/2/15) y recien despues el soporte y el top, que es lo que diria cualquiera
-- que haya visto la partida. La idea del techo es castigar el feed, no premiar
-- al que no aparecio.
--
-- El dano entra, pero como porcentaje del de su equipo y con peso chico: es un
-- desempate entre dos partidos parecidos, no un motor. Un soporte con el 6% del
-- dano pierde 0,7 puntos contra un ADC con el 40%, sobre un maximo de 21.
--
-- Los pesos siguen juntos y en un solo lugar a proposito: esta vista es el
-- unico sitio donde se toca el MVP, y al ser vista el cambio arrastra solo a
-- match_summaries.mvp_*, a player_totals.avg_score y mvp_count, a la card de
-- partida y al MVP de fase.
--
-- Efecto colateral esperado: cambia el MVP de partidas ya cargadas.

create or replace view public.match_player_scores with (security_invoker = on) as
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
      + 10.0 * coalesce(base.kill_participation, 0)     -- MVP_KP_WEIGHT (viene 0..1)
      + 2.0  * coalesce(base.damage_share, 0)           -- MVP_DAMAGE_WEIGHT (viene 0..1)
      + case when base.win then 2.0 else 0.0 end        -- MVP_WIN_BONUS
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
  -- La formula nueva es mucho mas chata que la vieja (tres terminos en vez de
  -- diez), asi que los empates dejan de ser raros: dos jugadores del equipo
  -- ganador con el mismo KDA y la misma participacion empatan clavado. Sin
  -- desempate, `rank() = 1` devolveria dos MVP y la card mostraria cualquiera
  -- de los dos segun el plan de ejecucion. El puuid al final garantiza que el
  -- orden sea total: dentro de una partida es unico.
  rank() over (
    partition by scored.match_id
        order by scored.score desc,
                 scored.kills desc,
                 scored.damage_to_champions desc,
                 scored.puuid
  )                                                                        as match_rank
from scored;

-- match_summaries elegia el MVP con `order by score desc limit 1`, que con
-- empates devuelve cualquiera. Ahora se apoya en match_rank, que ya viene
-- desempatado. Se re-declara entera porque create or replace view exige repetir
-- todas las columnas en el mismo orden; lo unico que cambia es el lateral.

create or replace view public.match_summaries with (security_invoker = on) as
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

-- --- 2. Universidad de una persona -------------------------------------------
--
-- Devuelve la universidad de un jugador: la que declaro al inscribirse si su
-- cuenta de Riot ya esta emparejada con el inscripto, y si no la principal de su
-- equipo. Para los 16 equipos de una sola universidad las dos ramas dan lo
-- mismo; para los cuatro mezclados, la primera es la unica correcta.
--
-- SECURITY DEFINER a proposito, y es seguro: lee team_roster (que es privada
-- porque son nombres legales de personas reales) pero devuelve un uuid de
-- universidad y nada mas. La universidad de un jugador es justamente lo que el
-- sitio muestra en publico; el nombre y apellido nunca sale de aca. Sin esto,
-- cuando la fase 4 abra el sitio sin sesion la atribucion se caeria en silencio
-- a la universidad del equipo y nadie se enteraria.

create or replace function public.player_university_id(p_player_id uuid, p_team_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select r.university_id
        from public.team_roster r
       where r.player_id = p_player_id
         and r.university_id is not null
       limit 1
    ),
    (select t.university_id from public.teams t where t.id = p_team_id)
  );
$$;

comment on function public.player_university_id(uuid, uuid) is
  'Universidad de un jugador: la de su inscripcion si esta emparejada, si no la principal de su equipo. Devuelve solo el id, nunca datos del inscripto.';

-- --- 3. Contexto de una partida ---------------------------------------------
--
-- Donde cae cada partida dentro del torneo, resuelto en un solo lugar y con una
-- prioridad clara:
--
--   1. El cruce del fixture al que esta enganchada. Es lo que publico la
--      organizacion, asi que le gana a todo.
--   2. La serie de playoffs, si tiene una.
--   3. Las etiquetas de texto que dejo la subida (stage_label / round_label).
--
-- Sin esto habria dos nociones de "fecha" conviviendo: la del calendario y la
-- del nombre del archivo. Con un .rofl mal nombrado, las estadisticas dirian
-- una cosa y la tabla de posiciones otra.

create view public.match_context with (security_invoker = on) as
select
  m.id                                              as match_id,
  coalesce(m.tournament_id, f.tournament_id, st.tournament_id) as tournament_id,
  case
    when f.id is not null                                          then 'grupos'
    when m.series_id is not null                                   then 'playoffs'
    when m.stage_label is not null or m.round_label is not null    then 'grupos'
  end                                               as phase,
  -- Sin fixture se conserva la regla vieja (stage_label es el grupo), que es de
  -- lo que depende group_standings desde antes.
  coalesce(f.group_label, case when m.series_id is null then m.stage_label end)
                                                    as group_label,
  coalesce(
    f.matchday,
    substring(m.round_label from 'Fecha[[:space:]]*([0-9]+)')::smallint
  )                                                 as matchday,
  f.slot,
  m.series_id,
  coalesce(f.stage_id, s.stage_id)                  as stage_id,
  -- Etiqueta para mostrar: "Fecha 2" en grupos, el nombre de la ronda en
  -- playoffs, y lo que haya quedado del nombre del archivo como ultimo recurso.
  coalesce(
    case when f.matchday is not null then 'Fecha ' || f.matchday end,
    s.round,
    m.round_label
  )                                                 as round_label,
  m.played_at,
  m.game_length_ms
from public.matches m
left join public.fixtures f on f.match_id = m.id
left join public.series   s on s.id = m.series_id
left join public.stages   st on st.id = coalesce(f.stage_id, s.stage_id);

comment on view public.match_context is
  'Grupo, fecha y turno de cada partida. El fixture manda; las etiquetas del archivo son el ultimo recurso.';

-- La tabla de grupos pasa a usar el mismo criterio: hasta ahora una partida
-- sumaba solo si su stage_label coincidia con el grupo del equipo, o sea que
-- dependia de como se llamaba el archivo. Ahora tambien suma si esta enganchada
-- al cruce del fixture, que es lo que la organizacion publico. Se re-declara
-- entera porque create or replace view exige repetir todas las columnas.

create or replace view public.group_standings with (security_invoker = on) as
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
  count(r.match_id)                                        as games,
  count(*) filter (where r.win)                            as wins,
  count(*) filter (where not r.win)                        as losses,
  coalesce(sum(r.kills), 0)                                as kills,
  coalesce(sum(r.kills_against), 0)                        as kills_against,
  coalesce(sum(r.kills) - sum(r.kills_against), 0)         as kill_diff,
  coalesce(sum(r.gold) - sum(r.gold_against), 0)           as gold_diff,
  round(avg(r.game_length_ms) / 60000.0, 1)                as avg_minutes,
  max(r.played_at)                                         as last_played_at,
  (array_remove(array_agg(r.win order by r.played_at desc nulls last, r.match_id), null))[1:5]
                                                           as form,
  rank() over (
    partition by t.tournament_id, t.group_label
        order by count(*) filter (where r.win) desc,
                 count(*) filter (where not r.win) asc,
                 coalesce(sum(r.kills) - sum(r.kills_against), 0) desc,
                 t.name asc
  )                                                        as position,
  public.team_university_tags(t.id)                        as university_tags
from public.teams t
left join public.universities u on u.id = t.university_id
left join public.team_match_results r
       on r.team_id = t.id
      and r.win is not null
      and r.opponent_team_id is not null
      and exists (
        select 1
          from public.match_context c
         where c.match_id = r.match_id
           and c.phase = 'grupos'
           and c.group_label = t.group_label
      )
where t.group_label is not null
group by t.tournament_id, t.group_label, t.id, t.name, t.tag, t.logo_url,
         u.id, u.name, u.tag, u.logo_url;

-- --- 4. Una fila por jugador y partida ---------------------------------------
--
-- La base de todo lo que sigue: el scoreboard de cada partida con el contexto
-- del torneo pegado al lado y los nombres ya resueltos, para que ninguna vista
-- de arriba tenga que volver a joinear equipos ni universidades.
--
-- Lleva puuid porque es la identidad estable de un jugador entre partidas (el
-- Riot ID cambia, el puuid no) y es por lo que agrupan las vistas de acumulados.
-- NINGUNA vista agregada de este archivo lo expone y la capa de TypeScript
-- nunca lo selecciona. Cuando la fase 4 abra el sitio sin sesion, esta vista es
-- una de las que hay que revisar.
--
-- El nombre para mostrar es el alias que haya cargado el panel o el Riot game
-- name; el tag (#ARG) no entra, y el nombre legal del inscripto tampoco.

create view public.player_match_stats with (security_invoker = on) as
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
  mp.puuid,
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
  -- Reemplaza a los first bloods, que el .rofl no guarda: la racha mas larga sin
  -- morir si esta, y cuenta la misma historia.
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

-- --- 5. Acumulados por jugador ----------------------------------------------
--
-- Dos filas por jugador y fecha: la de esa fecha y la de toda la fase. Se
-- distinguen por is_total y no por matchday, porque una partida sin fecha
-- resuelta tambien tiene matchday null y si no habria forma de separarlas.

create view public.player_phase_totals with (security_invoker = on) as
select
  s.tournament_id,
  s.phase,
  s.matchday,
  s.round_label,
  (grouping(s.round_label) = 1)                      as is_total,

  max(s.player_id::text)::uuid                       as player_id,
  max(s.player_name)                                 as player_name,
  max(s.team_id::text)::uuid                         as team_id,
  max(s.team_name)                                   as team_name,
  max(s.team_tag)                                    as team_tag,
  max(s.university_id::text)::uuid                   as university_id,
  max(s.university_tag)                              as university_tag,
  -- El rol en el que mas jugo: sirve para el quinteto de la fecha.
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
group by grouping sets (
  (s.tournament_id, s.phase, s.puuid, s.matchday, s.round_label),
  (s.tournament_id, s.phase, s.puuid)
);

-- --- 6. Acumulados por equipo ------------------------------------------------

create view public.team_phase_totals with (security_invoker = on) as
select
  c.tournament_id,
  c.phase,
  c.matchday,
  c.round_label,
  (grouping(c.round_label) = 1)                      as is_total,

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
  sum(r.dragons) + sum(r.barons) + sum(r.heralds)    as objectives
from public.team_match_results r
join public.match_context c on c.match_id = r.match_id
join public.teams t on t.id = r.team_id
where r.win is not null and r.opponent_team_id is not null
group by grouping sets (
  (c.tournament_id, c.phase, r.team_id, c.matchday, c.round_label),
  (c.tournament_id, c.phase, r.team_id)
);

-- --- 7. Acumulados por universidad -------------------------------------------
--
-- Se cuenta por APARICION (jugador-partida), no por partido, y es a proposito:
-- con equipos mezclados un mismo partido le puede sumar a tres universidades a
-- la vez, cada una por los jugadores que puso. Contar partidos obligaria a
-- decidir de quien es un partido que jugaron tres universidades juntas, y no
-- hay respuesta correcta a eso.
--
-- Consecuencia practica: `wins` son victorias de sus jugadores. Un equipo de una
-- sola universidad que gana suma 5, no 1. Como todas las universidades se miden
-- igual el ranking no se distorsiona, pero la UI tiene que aclarar la unidad.

create view public.university_totals with (security_invoker = on) as
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
  count(distinct s.puuid)                            as players,
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

-- --- 8. Campeones ------------------------------------------------------------
--
-- Los picks salen del scoreboard. Los bans hay que cargarlos a mano (el .rofl no
-- guarda el draft) y pueden no estar nunca, asi que:
--
--   * `bans` y `presence` se calculan SOLO sobre las partidas que tienen bans
--     cargados, y `matches_with_bans` dice sobre cuantas. Con la mitad de las
--     partidas cargadas, una presencia del 60% es del 60% de esa mitad, y la UI
--     tiene que decirlo.
--   * `matches` es el total de partidas del recorte, para poder comparar.

create view public.champion_stats with (security_invoker = on) as
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
-- La union de los dos lados, y no los picks solos: un campeon que se banea
-- siempre y por eso nunca se juega no aparece en `picked`, y es justamente el
-- que tiene que encabezar el ranking de bans.
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
-- is not distinct from y no =: las columnas del recorte son null en las filas
-- acumuladas, y con = ninguna fila acumulada encontraria su par.
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

-- --- 9. Records de partida ---------------------------------------------------
--
-- Una fila por partida con lo que hace falta para "la mas larga", "la mas
-- corta", "la mas pareja" y "la paliza". Se consulta con el mismo recorte que
-- todo lo demas, asi que sirve igual para una fecha o para la fase entera: no
-- hacen falta vistas separadas.

create view public.match_records with (security_invoker = on) as
select
  m.id                                               as match_id,
  c.tournament_id,
  c.phase,
  c.group_label,
  c.matchday,
  c.slot,
  c.round_label,
  m.played_at,
  m.game_length_ms,
  round(m.game_length_ms / 60000.0, 1)               as minutes,
  m.ended_in_surrender,
  m.patch,

  m.blue_team_id,
  bt.name                                            as blue_team_name,
  coalesce(blue.kills, 0)                            as blue_kills,
  coalesce(blue.gold, 0)                             as blue_gold,
  m.red_team_id,
  rt.name                                            as red_team_name,
  coalesce(red.kills, 0)                             as red_kills,
  coalesce(red.gold, 0)                              as red_gold,

  coalesce(blue.kills, 0) + coalesce(red.kills, 0)      as total_kills,
  abs(coalesce(blue.kills, 0) - coalesce(red.kills, 0)) as kill_gap,
  abs(coalesce(blue.gold, 0) - coalesce(red.gold, 0))   as gold_gap,

  case when m.winning_side = 100 then m.blue_team_id
       when m.winning_side = 200 then m.red_team_id  end as winner_team_id,
  case when m.winning_side = 100 then bt.name
       when m.winning_side = 200 then rt.name        end as winner_name,
  case when m.winning_side = 100 then rt.name
       when m.winning_side = 200 then bt.name        end as loser_name
from public.matches m
join public.match_context c on c.match_id = m.id
left join public.teams bt on bt.id = m.blue_team_id
left join public.teams rt on rt.id = m.red_team_id
left join public.match_team_stats blue on blue.match_id = m.id and blue.side = 100
left join public.match_team_stats red  on red.match_id  = m.id and red.side  = 200;

-- --- 10. MVP de fase ---------------------------------------------------------
--
-- Promedio del score con un minimo de partidas, para que uno que jugo una sola y
-- la rompio no se lleve el premio de la fase. El minimo depende del recorte y
-- por eso es una funcion: dentro de una fecha un equipo juega uno o dos partidos
-- (asi que alcanza con haber jugado), pero la fase entera son cuatro y pedir
-- tres deja afuera al que aparecio una vez.
--
-- Es el unico lugar donde se toca ese umbral.

create or replace function public.mvp_min_games(p_is_total boolean)
returns integer
language sql
immutable
as $$
  select case when p_is_total then 3 else 1 end;
$$;

comment on function public.mvp_min_games(boolean) is
  'Partidas minimas para entrar al MVP. Unico lugar donde se ajusta el umbral.';

create view public.tournament_mvp with (security_invoker = on) as
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
