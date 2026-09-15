-- ===========================================================================
-- Un resultado que la organizacion anula por reglamento.
--
-- EL CASO. Fecha 2, turno 1, Equipo 06 vs Equipo 17: el 17 gano jugando, 25 a
-- 23, con una alineacion que no era la de su plantel habilitado —dos perfiles
-- nuevos respecto de las rondas 1 y 2—. La organizacion anulo el resultado y
-- resolvio la partida por "alineacion indebida": gana el 06, pierde el 17.
--
-- POR QUE NO ES UN W.O. El mecanismo de no presentacion (0024) exige que el
-- cruce no tenga partida, y desengancharla no alcanza: `match_context` cae a
-- las etiquetas del archivo —"Grupo D", "Fecha 2"— y la tabla contaria las DOS
-- cosas, la victoria del 17 jugando y la del 06 por W.O. Ademas el fixture
-- escribiria "W.O.", que dice que alguien no se presento, y no es lo que paso.
--
-- QUE SE ANULA: TODA LA PARTIDA, no solo quien gano. Ninguna estadistica sale
-- de ella —MVP, campeones, jugadores, universidades, records, totales de
-- equipo—: sumar el KDA de perfiles no registrados a un ranking premiaria justo
-- lo que se sanciono. La partida SIGUE EXISTIENDO: su replay, su scoreboard y
-- su lugar en /partidas quedan, marcados como anulados, porque son la prueba de
-- lo que se sanciono y borrarlos no deja rastro de por que la tabla dice lo que
-- dice.
--
-- DONDE VIVE. En el cruce, como el W.O., porque es una decision de la
-- organizacion sobre ese cruce. Pero a diferencia del W.O. convive con la
-- partida: el fallo no dice que no se jugo, dice que lo que se jugo no vale.
--
-- DONDE SE CORTA. `match_context.annulled` es la unica definicion. La excluyen
-- las dos bases de las que cuelgan casi todos los agregados
-- —`team_match_results` y `player_match_stats`— y los cuatro agregados que leen
-- `matches` directo y se las saltean: `match_records`, `team_totals`,
-- `player_totals` y `player_champion_totals`. El detalle de la partida sale de
-- `match_player_scores` y `match_team_stats`, que no se tocan: el scoreboard se
-- sigue viendo entero.
--
-- EL RESULTADO DEL FALLO lo suman `group_standings` y `fixture_results` por el
-- mismo camino que el W.O.: partido, victoria y derrota, sin kills, y cuenta
-- para el enfrentamiento directo. Leen `coalesce(walkover, fallo)`, que es
-- exacto porque un check impide que un cruce tenga los dos.
--
-- CUIDADO CON `security_invoker`. Seis de estas vistas nacieron en `on` y
-- 0013_publico.sql las paso a `off` con un `alter view`. Copiar el `with (...)`
-- de su definicion original las devolveria a `on` sin que nadie lo note, y a
-- varias las lee `anon`. Cada una se redefine con el valor que tiene HOY.
-- ===========================================================================

-- --- 1. El fallo, en el cruce -------------------------------------------------

alter table public.fixtures
  add column if not exists ruling_winner_team_id uuid references public.teams(id) on delete set null,
  add column if not exists ruling text;

comment on column public.fixtures.ruling_winner_team_id is
  'A quien le dio el cruce la organizacion por reglamento, por encima del resultado jugado. Null si no hubo fallo.';
comment on column public.fixtures.ruling is
  'Por que: hoy solo alineacion_indebida. La partida enganchada, si hay, queda anulada para toda estadistica.';

do $$
begin
  -- Un ganador por reglamento necesita un motivo: la interfaz tiene que poder
  -- decir por que ese resultado no es el que se jugo. Solo en ese sentido, para
  -- que el `on delete set null` sobre el ganador no pueda chocar contra esto.
  if not exists (select 1 from pg_constraint where conname = 'fixtures_ruling_has_reason') then
    alter table public.fixtures
      add constraint fixtures_ruling_has_reason
      check (ruling_winner_team_id is null or ruling is not null);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'fixtures_ruling_is_a_team') then
    alter table public.fixtures
      add constraint fixtures_ruling_is_a_team
      check (ruling_winner_team_id is null
             or ruling_winner_team_id = team_a_id
             or ruling_winner_team_id = team_b_id);
  end if;

  -- Los motivos son los que la interfaz sabe nombrar. Uno nuevo se agrega en
  -- una migracion, junto con su rotulo, y no aparece solo en la base.
  if not exists (select 1 from pg_constraint where conname = 'fixtures_ruling_known') then
    alter table public.fixtures
      add constraint fixtures_ruling_known
      check (ruling is null or ruling in ('alineacion_indebida'));
  end if;

  -- Un cruce no puede estar dado por ganado a uno por no presentacion y a otro
  -- por reglamento. Es lo que hace exacto el `coalesce` de las vistas.
  if not exists (select 1 from pg_constraint where conname = 'fixtures_ruling_or_walkover') then
    alter table public.fixtures
      add constraint fixtures_ruling_or_walkover
      check (walkover_team_id is null or ruling_winner_team_id is null);
  end if;
end $$;

-- --- 2. Las vistas ------------------------------------------------------------
--
-- En orden de dependencia: primero la que define "anulada", despues las que la
-- leen. Cada una repite su definicion vigente entera porque `create or replace
-- view` no deja otra; lo que cambia esta marcado NUEVO.

create or replace view public.match_context with (security_invoker = off) as
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
  m.game_length_ms,
  -- NUEVAS. Anulada = el cruce al que esta enganchada tiene un fallo de la
  -- organizacion. Es la unica definicion: todo lo que excluye una partida
  -- anulada lee esta columna y no vuelve a preguntarle a `fixtures`.
  (f.ruling_winner_team_id is not null)             as annulled,
  f.ruling,
  f.ruling_winner_team_id
from public.matches m
left join public.fixtures f on f.match_id = m.id
left join public.series   s on s.id = m.series_id
left join public.stages   st on st.id = coalesce(f.stage_id, s.stage_id);

create or replace view public.team_match_results with (security_invoker = off) as
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
  coalesce(own.turrets, 0)   as turrets,
  -- Nuevas: scope por torneo y por serie de playoffs.
  m.tournament_id,
  m.series_id,
  coalesce(own.heralds, 0)   as heralds,
  coalesce(own.inhibitors, 0) as inhibitors
from sides s
join public.matches m on m.id = s.match_id
join public.teams t on t.id = s.team_id
left join public.teams o on o.id = s.opponent_team_id
left join public.match_team_stats own   on own.match_id   = s.match_id and own.side   = s.side
left join public.match_team_stats rival on rival.match_id = s.match_id and rival.side = s.opponent_side
-- NUEVO: una partida anulada no tiene resultado. El que vale es el del fallo, y
-- ese lo suman `group_standings` y `fixture_results` desde el cruce.
left join public.match_context c on c.match_id = s.match_id
where not coalesce(c.annulled, false);

create or replace view public.player_match_stats with (security_invoker = off) as
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
left join public.universities u on u.id = public.player_university_id(mp.player_id, mp.team_id)
-- NUEVO: lo que pasa en una partida anulada no cuenta para ninguna estadistica.
where not coalesce(c.annulled, false);

create or replace view public.match_records with (security_invoker = off) as
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
left join public.match_team_stats red  on red.match_id  = m.id and red.side  = 200
-- NUEVO: una partida anulada no se queda con ningun record.
where not c.annulled;

create or replace view public.team_totals with (security_invoker = off) as
with team_games as (
  select m.blue_team_id as team_id, m.id as match_id, 100 as side,
         (m.winning_side = 100) as win, m.game_length_ms
  from public.matches m
  join public.match_context c on c.match_id = m.id
  where m.blue_team_id is not null and not c.annulled
  union all
  select m.red_team_id, m.id, 200,
         (m.winning_side = 200), m.game_length_ms
  from public.matches m
  join public.match_context c on c.match_id = m.id
  where m.red_team_id is not null and not c.annulled
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
  sum(ts.turrets)                             as turrets,
  -- Nuevas.
  t.tournament_id,
  t.group_label,
  t.logo_url,
  t.university_id
from public.teams t
left join team_games g on g.team_id = t.id
left join public.match_team_stats ts on ts.match_id = g.match_id and ts.side = g.side
group by t.id, t.name, t.tag, t.tournament_id, t.group_label, t.logo_url, t.university_id;

create or replace view public.player_totals with (security_invoker = off) as
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
join public.match_context c on c.match_id = mp.match_id
left join public.players p on p.id = mp.player_id
left join public.match_player_scores s on s.match_player_id = mp.id
where mp.player_id is not null
  and not c.annulled
group by mp.player_id, m.tournament_id;

create or replace view public.player_champion_totals with (security_invoker = off) as
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
join public.match_context c on c.match_id = mp.match_id
where mp.player_id is not null
  and not c.annulled
group by mp.player_id, mp.champion, m.tournament_id;

create or replace view public.match_summaries with (security_invoker = off) as
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
  rt.logo_url            as red_team_logo,
  c.matchday,
  c.group_label,
  c.phase,
  c.slot,
  (select count(*) from public.match_bans b where b.match_id = m.id) as ban_count,
  -- NUEVAS: la partida sigue en el listado, con su replay, pero dice que no vale.
  coalesce(c.annulled, false) as annulled,
  c.ruling,
  c.ruling_winner_team_id
from public.matches m
left join public.teams bt on bt.id = m.blue_team_id
left join public.teams rt on rt.id = m.red_team_id
left join public.match_team_stats blue on blue.match_id = m.id and blue.side = 100
left join public.match_team_stats red  on red.match_id  = m.id and red.side  = 200
left join public.match_context c on c.match_id = m.id
left join lateral (
  select * from public.match_player_scores s
  where s.match_id = m.id and s.match_rank = 1
) mvp on true;

create or replace view public.fixture_results with (security_invoker = on) as
select
  f.id,
  f.tournament_id,
  f.stage_id,
  f.group_label,
  f.matchday,
  f.slot,
  f.kickoff,
  f.match_id,

  f.team_a_id,
  ta.name     as team_a_name,
  ta.tag      as team_a_tag,
  ta.logo_url as team_a_logo,
  ra.kills    as team_a_kills,
  coalesce(ra.win, coalesce(f.walkover_team_id, f.ruling_winner_team_id) = f.team_a_id) as team_a_win,

  f.team_b_id,
  tb.name     as team_b_name,
  tb.tag      as team_b_tag,
  tb.logo_url as team_b_logo,
  rb.kills    as team_b_kills,
  coalesce(rb.win, coalesce(f.walkover_team_id, f.ruling_winner_team_id) = f.team_b_id) as team_b_win,

  m.played_at,
  m.game_length_ms,
  m.ended_in_surrender,

  case
    when f.ruling_winner_team_id is not null then f.ruling_winner_team_id
    when f.walkover_team_id is not null then f.walkover_team_id
    when ra.win then f.team_a_id
    when rb.win then f.team_b_id
  end as winner_team_id,

  case
    when f.ruling_winner_team_id is not null then 'reglamento'
    when f.walkover_team_id is not null then 'w.o.'
    when f.match_id is null then 'pendiente'
    when ra.win is null and rb.win is null then 'sin resultado'
    else 'jugado'
  end as status,

  public.team_university_tags(f.team_a_id) as team_a_universities,
  public.team_university_tags(f.team_b_id) as team_b_universities,

  -- Nueva: quién se quedó con el cruce sin jugarlo. La página la necesita
  -- aparte de `winner_team_id` para escribir "W.O." donde iría el marcador.
  f.walkover_team_id,
  -- NUEVA: el motivo del fallo, para que el fixture lo nombre.
  f.ruling
from public.fixtures f
join public.teams ta on ta.id = f.team_a_id
join public.teams tb on tb.id = f.team_b_id
left join public.matches m on m.id = f.match_id
left join public.team_match_results ra on ra.match_id = f.match_id and ra.team_id = f.team_a_id
left join public.team_match_results rb on rb.match_id = f.match_id and rb.team_id = f.team_b_id;

create or replace view public.group_standings with (security_invoker = on) as
with resultados as (
  -- Lo que se jugó. Igual que en 0024.
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
      select coalesce(f.walkover_team_id, f.ruling_winner_team_id) as team_id, true as win, f.kickoff, f.group_label
        from public.fixtures f
       where coalesce(f.walkover_team_id, f.ruling_winner_team_id) is not null
      union all
      select case when coalesce(f.walkover_team_id, f.ruling_winner_team_id) = f.team_a_id then f.team_b_id else f.team_a_id end,
             false, f.kickoff, f.group_label
        from public.fixtures f
       where coalesce(f.walkover_team_id, f.ruling_winner_team_id) is not null
    ) w
),

-- NUEVO: quién le ganó a quién. Sólo las victorias: la derrota del otro es la
-- misma fila leída al revés y contarla no agrega nada.
--
-- El W.O. entra igual que una partida. El equipo que no se presentó perdió el
-- cruce para todo efecto, y el mano a mano es uno de ellos: si después terminan
-- igualados, el que se presentó está arriba.
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
  select coalesce(f.walkover_team_id, f.ruling_winner_team_id),
         case when coalesce(f.walkover_team_id, f.ruling_winner_team_id) = f.team_a_id then f.team_b_id else f.team_a_id end,
         f.group_label
    from public.fixtures f
   where coalesce(f.walkover_team_id, f.ruling_winner_team_id) is not null
),

-- La tabla de siempre, sin el puesto. Se parte en dos porque el desempate
-- necesita los récords ya sumados para saber quiénes están igualados, y eso no
-- se puede mirar desde adentro del mismo agregado.
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

-- El desempate: victorias contra los que están igualados en victorias Y
-- derrotas.
--
-- Las derrotas van en la igualdad y no sólo las victorias porque a mitad de
-- fase dos equipos pueden tener las mismas victorias con distinta cantidad de
-- partidos jugados, y ahí ya los separa el criterio anterior: no están
-- empatados y no hay nada que desempatar entre ellos.
--
-- Los dos equipos de un empate cuentan contra el MISMO conjunto —el de los que
-- comparten ese récord— así que los dos números son comparables, que es lo que
-- permite usarlos como una columna más del `order by`.
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

-- --- 3. Cargarlo y deshacerlo -------------------------------------------------
--
-- Igual que `set_fixture_walkover`: con el ganador en null se limpia. Un fallo
-- cargado mal le cambia una victoria de dueno en la tabla y le borra una partida
-- entera a las estadisticas, asi que tiene que poder revertirse desde el panel.

create or replace function public.set_fixture_ruling(
  p_fixture_id     uuid,
  p_winner_team_id uuid default null,
  p_ruling         text default 'alineacion_indebida'
)
returns jsonb
language plpgsql
as $$
declare
  v_fixture    public.fixtures%rowtype;
  v_ganador    text;
  v_sancionado text;
begin
  select * into v_fixture from public.fixtures where id = p_fixture_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Ese cruce no existe.');
  end if;

  if p_winner_team_id is null then
    update public.fixtures
       set ruling_winner_team_id = null, ruling = null
     where id = p_fixture_id;
    return jsonb_build_object('ok', true, 'cleared', true);
  end if;

  if v_fixture.walkover_team_id is not null then
    return jsonb_build_object(
      'ok', false,
      'error', 'Este cruce está cargado como no presentado. Sacá el W.O. primero.'
    );
  end if;

  if p_winner_team_id <> v_fixture.team_a_id and p_winner_team_id <> v_fixture.team_b_id then
    return jsonb_build_object('ok', false, 'error', 'Ese equipo no juega este cruce.');
  end if;

  if p_ruling is null or p_ruling not in ('alineacion_indebida') then
    return jsonb_build_object('ok', false, 'error', 'Ese motivo no existe.');
  end if;

  update public.fixtures
     set ruling_winner_team_id = p_winner_team_id, ruling = p_ruling
   where id = p_fixture_id;

  select t.name into v_ganador from public.teams t where t.id = p_winner_team_id;
  select t.name into v_sancionado
    from public.teams t
   where t.id = case when p_winner_team_id = v_fixture.team_a_id
                     then v_fixture.team_b_id else v_fixture.team_a_id end;

  return jsonb_build_object(
    'ok', true,
    'winner', v_ganador,
    'sanctioned', v_sancionado,
    'ruling', p_ruling,
    'matchday', v_fixture.matchday,
    'annulled_match', v_fixture.match_id is not null
  );
end;
$$;

comment on function public.set_fixture_ruling(uuid, uuid, text) is
  'Da un cruce por reglamento y anula la partida enganchada para toda estadistica, o limpia el fallo con el ganador en null.';

revoke execute on function public.set_fixture_ruling(uuid, uuid, text) from public, anon, authenticated;

comment on column public.match_context.annulled is
  'La partida esta enganchada a un cruce con fallo de la organizacion: no cuenta para ninguna estadistica.';
