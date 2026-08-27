-- ===========================================================================
-- El sitio se abre al publico.
--
-- Hasta ahora todo estaba detras del login, asi que alcanzaba con darle lectura
-- a `authenticated` y listo. Con visitantes sin sesion cambian dos cosas de
-- fondo, y la segunda obliga a revisar una decision vieja.
--
-- 1. LA CLAVE PUBLICABLE VIAJA AL BROWSER.
--    No alcanza con que las paginas no muestren algo: cualquiera puede pegarle
--    directo a PostgREST con esa clave y pedir lo que quiera. Lo que no tiene
--    que verse no se puede esconder en el frontend, tiene que estar cerrado en
--    la base.
--
-- 2. LAS VISTAS PASAN A SER LA API PUBLICA.
--    Todas las vistas se crearon con `security_invoker = on`, que hace que
--    respeten el RLS de quien consulta. Eso era lo correcto cuando todos los
--    que consultaban tenian sesion: costaba nada y era mas seguro.
--
--    Con `anon` se da vuelta. Una vista invoker obliga a que el visitante tenga
--    acceso a las tablas crudas de abajo, y esas tablas tienen columnas que no
--    pueden salir: `match_players.puuid`, `match_players.raw` (el JSON original
--    con los 365 campos, PUUID incluido), `matches.raw_metadata`,
--    `players.puuid`. Abrirle las tablas al visitante para que funcionen las
--    vistas seria abrirle exactamente lo que queremos tapar.
--
--    Asi que se invierte: las tablas crudas quedan cerradas para `anon` y las
--    vistas publicas pasan a correr con los permisos de su dueno. La vista es
--    el contrato: lo que esta en su lista de columnas es publico, lo que no
--    esta no existe para el visitante.
--
-- Lo que NUNCA sale, ni por vista ni por tabla:
--
--   puuid              identifica la cuenta de Riot contra la API de Riot
--   raw / raw_metadata el JSON crudo, que trae el puuid adentro
--   team_roster        nombres legales de personas reales
--   match_files        rutas del storage de los .rofl
--   ingest_failures    nombres de archivo y errores internos
-- ===========================================================================

-- --- 1. Fuera el PUUID de las vistas -----------------------------------------
--
-- `create or replace view` no puede sacar una columna, asi que hay que tirar la
-- pila abajo y volver a levantarla. El cascade se lleva match_summaries,
-- player_totals, player_match_stats y todo lo que cuelga de ellas.
--
-- La identidad de un jugador pasa a ser `players.id`. Se agrupaba por puuid
-- porque es lo estable entre partidas (el Riot ID cambia, el puuid no), pero
-- `players.id` es igual de estable: hay una fila por puuid y la crea la propia
-- ingesta para los diez participantes antes de tocar match_players. La unica
-- diferencia es que este no sirve para preguntarle nada a Riot.

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
  -- Items y hechizos, que antes se pedian aparte a match_players. Ahora la
  -- tabla no es publica y este es el scoreboard: van aca, y de paso la pagina
  -- de partida hace una consulta menos.
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
  -- El desempate era por puuid, que ya no esta. `id` es la fila de
  -- match_players: unica en la partida, que es lo unico que hace falta para
  -- que el orden sea total y el MVP no baile entre consultas.
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

-- Los acumulados pasan a agrupar por player_id. Se descartan las filas sin
-- jugador: no deberia haber ninguna (la ingesta crea la fila de `players` para
-- los diez antes de escribir match_players), y si aparece una, sumarla a un
-- grupo "sin jugador" seria peor que dejarla afuera.

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

-- OJO CON LAS VISTAS ANIDADAS. `security_invoker` quiere decir "chequear contra
-- el usuario que consulta", y ese usuario sigue siendo el visitante aunque la
-- vista se este leyendo desde adentro de otra que corre con permisos de dueno.
-- No se hereda. O sea que una cadena mixta no funciona: si player_phase_totals
-- (dueno) lee player_match_stats (invoker), el visitante ve cero filas y la
-- estadistica sale vacia sin ningun error.
--
-- Asi que toda la cadena que tiene que ser publica va con permisos de dueno,
-- incluidas las vistas intermedias que nadie consulta de afuera. Se puede
-- porque ninguna expone puuid ni JSON crudo.

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

-- --- 2. La ficha de un jugador, sin puuid ------------------------------------
--
-- `players` deja de ser legible sin sesion porque su clave es el puuid. Esto es
-- lo que queda publico de una cuenta: como se llama y cuando se la vio.

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

-- --- 3. Las demas vistas publicas --------------------------------------------
--
-- Cambiar la opcion alcanza, no hace falta recrearlas. Ninguna de estas expone
-- puuid ni JSON crudo: lo unico que hacian falta eran los permisos.

alter view public.match_team_stats     set (security_invoker = false);
alter view public.team_totals          set (security_invoker = false);
alter view public.group_standings      set (security_invoker = false);
alter view public.series_results       set (security_invoker = false);
alter view public.fixture_results      set (security_invoker = false);
alter view public.fixture_byes         set (security_invoker = false);
alter view public.team_phase_totals    set (security_invoker = false);
alter view public.match_records        set (security_invoker = false);
alter view public.team_accounts        set (security_invoker = false);

-- Las intermedias tambien, por lo que dice el comentario de mas arriba: no las
-- consulta nadie de afuera, pero si quedan en invoker, todas las que cuelgan de
-- ellas devuelven cero filas a un visitante.
alter view public.match_context        set (security_invoker = false);
alter view public.team_match_results   set (security_invoker = false);
alter view public.team_standings       set (security_invoker = false);

-- Estas dos se quedan en invoker, y es a proposito: leen tablas que no tienen
-- policy para `anon`, asi que un visitante ve cero filas y con sesion se ven
-- enteras. Es justo lo que se busca.
--
--   roster_status        nombres legales de los inscriptos.
--   unassigned_matches   la cola del panel.

-- --- 4. Lectura sin sesion ---------------------------------------------------
--
-- Solo las tablas que no tienen nada que esconder. Las que faltan en esta lista
-- faltan a proposito: matches, match_players y players tienen puuid o JSON
-- crudo; match_files tiene las rutas del storage; team_roster, nombres legales;
-- ingest_failures, errores internos. A todo eso se llega por las vistas de
-- arriba, que muestran solo las columnas que corresponden.

create policy "lectura publica" on public.tournaments       for select to anon using (true);
create policy "lectura publica" on public.teams             for select to anon using (true);
create policy "lectura publica" on public.universities      for select to anon using (true);
create policy "lectura publica" on public.stages            for select to anon using (true);
create policy "lectura publica" on public.series            for select to anon using (true);
create policy "lectura publica" on public.fixtures          for select to anon using (true);
create policy "lectura publica" on public.team_universities for select to anon using (true);
create policy "lectura publica" on public.match_bans        for select to anon using (true);
