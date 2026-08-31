-- ===========================================================================
-- El meta con filtro por grupo, y una forma de cargar los bans.
--
-- LO QUE FALTABA. `champion_stats` (0013_publico.sql) recorta el meta por
-- fecha o acumulado, y nada mas. Alcanza para las tarjetas de /estadisticas,
-- que son un top 5 del torneo entero, pero no para mirar "que se jugo en el
-- Grupo B la fecha 2", que es lo primero que pregunta alguien que juega en el
-- Grupo B.
--
-- POR QUE UNA VISTA NUEVA Y NO UNA COLUMNA MAS EN `champion_stats`.
-- `loadStats()` la filtra con {tournament_id, phase, is_total: true}. Si se le
-- agregaran los grupos a los grouping sets, ese mismo filtro pasaria a
-- devolver cinco filas por campeon —el total y una por grupo— y las tarjetas
-- del meta mostrarian el mismo campeon repetido con numeros parciales, sin
-- tirar ningun error. Y esas tarjetas son las que se publican en Instagram
-- desde /admin/cards, asi que el radio de dano incluye lo que sale afuera.
-- `champion_meta` es aditiva: no toca nada de lo que ya anda.
--
-- LOS BANS. La tabla `match_bans` existe desde 0006_tournament.sql y esta
-- vacia: el .rofl no guarda el draft, asi que no hay de donde sacarlo salvo
-- que alguien lo escriba. Por eso `bans`, `ban_rate` y `presence` se miden
-- siempre sobre `matches_with_bans` y no sobre `matches`, y son NULL —no 0—
-- cuando no hay ninguna partida con draft cargado. Cero baneos y "no se sabe"
-- son cosas distintas y no se pueden dibujar igual.
--
-- `set_match_bans` es lo que le falta a esa tabla para poder llenarse.
-- ===========================================================================

-- --- 1. El meta, con grupo ----------------------------------------------------
--
-- Cuatro recortes en una sola vista, con el mismo truco de grouping sets que
-- usan las vistas de 0010/0013: el acumulado, por fecha, por grupo, y grupo
-- mas fecha. Una consulta con un filtro de igualdad elige cual.
--
-- LAS DOS BANDERAS. `all_groups` y `all_matchdays` dicen cual de los cuatro
-- es, y no se pueden reemplazar por `group_label is null` / `matchday is
-- null`: un group_label nulo puede significar "todos los grupos" (a proposito,
-- porque la fila es del acumulado) o "esta partida todavia no esta enganchada
-- a su cruce" (por accidente, porque match_context no lo pudo resolver). Es el
-- mismo motivo por el que las otras vistas llevan `is_total`.
--
-- Las partidas sin grupo resuelto arman su propio bucket con
-- all_groups = false y group_label = null. La UI nunca lo pide —solo ofrece
-- los grupos A a D— pero esas partidas si suman a las filas totales, que es
-- exactamente lo que ya hace `champion_stats` hoy.

create view public.champion_meta with (security_invoker = off) as
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
  end                                                as presence
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

comment on view public.champion_meta is
  'El meta de campeones en cuatro recortes a la vez: acumulado, por fecha, por grupo y grupo+fecha. all_groups y all_matchdays eligen cual. bans, ban_rate y presence se miden solo sobre matches_with_bans, y son NULL si no hay ningun draft cargado.';

-- --- 2. Cargar el draft a mano ------------------------------------------------
--
-- Reemplaza los bans de una partida enteros: los diez que se manden son los
-- que quedan. Va en SQL y no como delete + insert desde la server action por
-- el mismo motivo que `assign_match_to_fixture` (0011_asignacion.sql): dos
-- viajes a Postgres pueden dejar la partida con CERO bans si el insert falla
-- despues del delete, y eso se lee como "esta partida no tiene draft" sin que
-- nadie se entere de que se perdio algo que ya estaba cargado.

create or replace function public.set_match_bans(
  p_match_id   uuid,
  p_bans       jsonb,
  p_created_by uuid default null
)
returns jsonb
language plpgsql
as $$
declare
  v_entradas jsonb;
  v_mal      text;
  v_repetido text;
begin
  if not exists (select 1 from public.matches where id = p_match_id) then
    return jsonb_build_object('ok', false, 'error', 'Esa partida no existe.');
  end if;

  select string_agg(distinct e->>'side', ', ')
    into v_mal
    from jsonb_array_elements(coalesce(p_bans, '[]'::jsonb)) e
   where coalesce((e->>'side')::smallint, 0) not in (100, 200);

  if v_mal is not null then
    return jsonb_build_object('ok', false, 'error', 'Lado inválido: ' || v_mal || '.');
  end if;

  select string_agg(distinct e->>'order_index', ', ')
    into v_mal
    from jsonb_array_elements(coalesce(p_bans, '[]'::jsonb)) e
   where coalesce((e->>'order_index')::smallint, 0) not between 1 and 5;

  if v_mal is not null then
    return jsonb_build_object('ok', false, 'error', 'Orden de ban inválido: ' || v_mal || '.');
  end if;

  -- LA GRAFIA. `champion_meta` une picks y bans por igualdad exacta de texto,
  -- y las dos puntas escriben distinto: el .rofl guarda "FiddleSticks" y
  -- ddragon dice "Fiddlesticks". Sin esta linea ese campeon saldria DOS VECES
  -- en la tabla del meta, una con los picks y otra con los bans, cada una con
  -- la mitad de los numeros. Se adopta la grafia que ya usa la base para los
  -- campeones que alguna vez se jugaron; para el resto no hay contra que
  -- comparar y queda lo que vino (la app ya lo normaliza contra ddragon).
  --
  -- Los vacios se descartan y no se guardan: un equipo puede pasar un ban, y
  -- ahi ese order_index simplemente no existe.
  with crudas as (
    select
      (e->>'side')::smallint              as side,
      (e->>'order_index')::smallint       as order_index,
      btrim(coalesce(e->>'champion', '')) as champion
    from jsonb_array_elements(coalesce(p_bans, '[]'::jsonb)) e
  ),
  limpias as (
    select
      c.side,
      c.order_index,
      coalesce(
        (select mp.champion from public.match_players mp
          where lower(mp.champion) = lower(c.champion) limit 1),
        c.champion
      ) as champion
    from crudas c
    where c.champion <> ''
  )
  select coalesce(
           jsonb_agg(
             jsonb_build_object('side', l.side, 'order_index', l.order_index, 'champion', l.champion)
             order by l.side, l.order_index
           ),
           '[]'::jsonb
         )
    into v_entradas
    from limpias l;

  -- En un draft no se puede banear dos veces al mismo, asi que un repetido es
  -- casi siempre un error de carga: alguien se salteo un casillero.
  select e->>'champion'
    into v_repetido
    from jsonb_array_elements(v_entradas) e
   group by e->>'champion'
  having count(*) > 1
   limit 1;

  if v_repetido is not null then
    return jsonb_build_object('ok', false, 'error', v_repetido || ' está dos veces.');
  end if;

  delete from public.match_bans where match_id = p_match_id;

  insert into public.match_bans (match_id, side, champion, order_index, created_by)
  select p_match_id,
         (e->>'side')::smallint,
         e->>'champion',
         (e->>'order_index')::smallint,
         p_created_by
    from jsonb_array_elements(v_entradas) e;

  return jsonb_build_object('ok', true, 'bans', jsonb_array_length(v_entradas));
end;
$$;

comment on function public.set_match_bans(uuid, jsonb, uuid) is
  'Reemplaza el draft de una partida entero. Adopta la grafia de campeon que ya usa la base para que picks y bans no se separen en el meta.';

revoke execute on function public.set_match_bans(uuid, jsonb, uuid) from public, anon, authenticated;

-- --- 3. `match_summaries` con el recorte y el estado del draft -----------------
--
-- Cinco columnas al final. Las 29 de arriba van repetidas tal cual porque
-- `create or replace view` no deja renombrar ni reordenar: solo agregar.
--
-- OJO CON `security_invoker`. Va explicito otra vez aunque la vista ya lo
-- tenga: al reemplazarla se pierde la opcion y vuelve al default, y el sintoma
-- es que la lista de partidas queda vacia SOLO para quien no tiene sesion, sin
-- ningun error. En desarrollo, siempre logueado, se ve perfecta.
--
-- Para que sirve cada una:
--   matchday / group_label / phase / slot -> los filtros de /partidas salen de
--     un .eq() sobre esta misma vista, sin tener que juntar ids con
--     match_context primero.
--   ban_count -> el badge de "sin draft" del panel, con un count exacto y
--     head: true. Mismo patron que `file_count`.

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
  (select count(*) from public.match_bans b where b.match_id = m.id) as ban_count
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

comment on view public.match_summaries is
  'Una fila por partida para el listado publico: marcador, MVP, el recorte del torneo al que pertenece y cuantos bans tiene cargados.';
