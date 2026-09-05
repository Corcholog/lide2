-- ===========================================================================
-- El KDA promedio: el de cada partida, promediado.
--
-- QUE LE FALTABA A `kda`. La columna que ya estaba es la razon del total del
-- recorte: (todas las kills + todas las asistencias) / todas las muertes. Es
-- la cuenta correcta para "cuanto rindio en las cuatro fechas", y es la unica
-- que hay: la tarjeta "Mejor KDA" de /estadisticas sale de ahi.
--
-- Pero esa cuenta borra las partidas. Un jugador que hace 10/0/10 y despues
-- 0/10/0 termina con 20/10 = 2.00, el mismo numero que uno que hizo 5/5/5 dos
-- veces, y no jugaron parecido. Promediando partida por partida el primero da
-- (20 + 0) / 2 = 10.00 y el segundo 2.00, porque `match_player_scores` divide
-- por `greatest(deaths, 1)` y una partida sin morir cobra entera.
--
-- Ninguna de las dos es "la buena": la del total premia al que sostuvo el
-- rendimiento y la del promedio al que tuvo picos. Por eso se agrega al lado y
-- no en lugar de la otra, y por eso cada tarjeta dice en el subtitulo cual de
-- las dos esta mirando; dos numeros distintos bajo el mismo nombre "KDA" es
-- exactamente lo que hay que evitar.
--
-- POR QUE ACA Y NO EN TYPESCRIPT. `loadStats()` lee totales agregados, una
-- fila por jugador: el KDA de cada partida no viaja, asi que no hay forma de
-- promediarlo del lado del sitio sin traerse `player_match_stats` entera. La
-- vista ya esta parada sobre esas filas y hacer un `avg` mas no cuesta nada.
--
-- `create or replace view` solo deja AGREGAR columnas al final —no sacar, ni
-- renombrar, ni reordenar—, asi que `avg_kda` va ultima, despues de
-- `mvp_count`, y hay que repetir la definicion completa de 0013_publico.sql.
-- `tournament_mvp` cuelga de esta vista y no se toca: agregar al final no le
-- mueve nada.
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

  -- El KDA de cada partida, promediado. La otra columna, `kda`, es la razon
  -- del total; esta es el promedio de las razones, que no es lo mismo.
  round(avg(s.kda), 2)                               as avg_kda
from public.player_match_stats s
where s.player_id is not null
group by grouping sets (
  (s.tournament_id, s.phase, s.player_id, s.matchday, s.round_label),
  (s.tournament_id, s.phase, s.player_id)
);
