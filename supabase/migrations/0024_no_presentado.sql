-- ===========================================================================
-- El equipo que no se presenta pierde el punto. Sin replay que subir.
--
-- El reglamento da 15 minutos de tolerancia: pasados esos, el cruce se le da
-- por ganado al que sí está. No se juega, así que no hay .rofl, y ahí es donde
-- choca con todo lo que hay armado: el sitio entero cuelga de `matches`, que
-- pide `fingerprint`, `game_length_ms` y `raw_metadata` porque una partida ES
-- un replay parseado.
--
-- LO QUE NO SE HACE: inventar una fila en `matches`. Es la salida obvia —con
-- una partida trucha de cero minutos, la victoria la cuenta sola la tabla— y es
-- la peor. Esa fila aparecería en el listado de partidas, en `match_summaries`,
-- en los récords, en el promedio de duración de la tabla y en la meta de
-- campeones, en todos lados como un partido de verdad al que no jugó nadie. Y
-- habría que enseñarle a cada una de esas vistas a esquivarla, o sea agregarle
-- un caso especial a diez lugares para ahorrarse una columna en uno.
--
-- LO QUE SE HACE: el resultado vive en el cruce, que es donde ya vive todo lo
-- que la organización decide (0007_fixture.sql). `matches` sigue queriendo
-- decir "esto se jugó y hay un archivo que lo prueba", que es la invariante de
-- la que depende el resto del proyecto, y la tabla de posiciones aprende a
-- sumar dos clases de resultado en vez de una.
--
-- QUÉ SUMA Y QUÉ NO. El W.O. cuenta como partido jugado, victoria y derrota:
-- eso es lo que hace una tabla de posiciones. No suma kills ni oro —no hubo—,
-- así que no mueve la diferencia de kills, que es el primer desempate; entre
-- dos equipos igualados en victorias, el que ganó jugando queda arriba del que
-- ganó por ausencia, y está bien que así sea. Tampoco entra en el promedio de
-- duración: `avg` ignora los nulos, y un cero ahí diría que el equipo juega
-- partidos cortos.
--
-- LO QUE NO CUBRE: que no se presenten los dos. Con una sola columna
-- —quién ganó— no hay forma de escribir "ninguno". Es un caso que no pasó y
-- que, si pasa, se resuelve dejando el cruce pendiente hasta decidir qué hacer.
-- Agregar hoy la columna que lo modele sería adivinar el reglamento.
--
-- `team_standings` (0005) no se toca: es la tabla vieja, de antes del
-- calendario, que agrupa por `stage_label` y que ya no lee nadie —la que se
-- muestra es `group_standings`—. Enseñarle esto sería mantener dos veces una
-- regla que se usa una.
-- ===========================================================================

-- --- 1. Quién ganó sin jugar --------------------------------------------------

alter table public.fixtures
  add column if not exists walkover_team_id uuid references public.teams(id) on delete set null;

comment on column public.fixtures.walkover_team_id is
  'El equipo al que se le dio por ganado el cruce porque el rival no se presento. Null si se jugo o esta pendiente.';

-- Las dos cosas que no pueden pasar, en la base y no en la aplicación.
--
--   * Que el ganador por ausencia no sea ninguno de los dos que juegan el
--     cruce. Un id equivocado ahí le regala un punto a un equipo de otro grupo
--     y no lo ve nadie, porque la tabla no muestra de dónde salió cada victoria.
--   * Que un cruce esté jugado Y dado por ganado. Si hay replay, se jugó: son
--     dos afirmaciones contradictorias sobre el mismo partido y la tabla
--     terminaría contando las dos.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'fixtures_walkover_is_a_team'
  ) then
    alter table public.fixtures
      add constraint fixtures_walkover_is_a_team
      check (walkover_team_id is null
             or walkover_team_id = team_a_id
             or walkover_team_id = team_b_id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'fixtures_walkover_or_match'
  ) then
    alter table public.fixtures
      add constraint fixtures_walkover_or_match
      check (walkover_team_id is null or match_id is null);
  end if;
end $$;

-- --- 2. Cargarlo y sacarlo ----------------------------------------------------
--
-- Con el ganador en null se limpia, que es como se deshace una carga
-- equivocada: el mismo criterio que `assign_roster_account` y
-- `assign_team_member_role`. Un W.O. cargado mal le saca un punto a alguien en
-- la tabla, así que tiene que poder revertirse desde el panel y no a mano
-- desde el editor SQL.

create or replace function public.set_fixture_walkover(
  p_fixture_id     uuid,
  p_winner_team_id uuid default null
)
returns jsonb
language plpgsql
as $$
declare
  v_fixture public.fixtures%rowtype;
  v_ganador text;
  v_ausente text;
begin
  select * into v_fixture from public.fixtures where id = p_fixture_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Ese cruce no existe.');
  end if;

  if p_winner_team_id is null then
    update public.fixtures set walkover_team_id = null where id = p_fixture_id;
    return jsonb_build_object('ok', true, 'cleared', true);
  end if;

  -- El replay manda. Si el cruce ya tiene partida, se jugó, y darlo por ganado
  -- sería tapar un resultado real con uno administrativo. Se avisa en vez de
  -- chocar contra el check de arriba, que devolvería un error de constraint
  -- que no le dice nada a quien lo lee.
  if v_fixture.match_id is not null then
    return jsonb_build_object(
      'ok', false,
      'error', 'Este cruce ya tiene una partida cargada: si de verdad no se jugó, desasignala primero.'
    );
  end if;

  if p_winner_team_id <> v_fixture.team_a_id and p_winner_team_id <> v_fixture.team_b_id then
    return jsonb_build_object('ok', false, 'error', 'Ese equipo no juega este cruce.');
  end if;

  update public.fixtures
     set walkover_team_id = p_winner_team_id
   where id = p_fixture_id;

  select t.name into v_ganador from public.teams t where t.id = p_winner_team_id;
  select t.name into v_ausente
    from public.teams t
   where t.id = case when p_winner_team_id = v_fixture.team_a_id
                     then v_fixture.team_b_id else v_fixture.team_a_id end;

  return jsonb_build_object(
    'ok', true,
    'winner', v_ganador,
    'absent', v_ausente,
    'matchday', v_fixture.matchday
  );
end;
$$;

comment on function public.set_fixture_walkover(uuid, uuid) is
  'Da un cruce por ganado porque el rival no se presento, o limpia esa carga con el ganador en null.';

revoke execute on function public.set_fixture_walkover(uuid, uuid) from public, anon, authenticated;

-- --- 3. El cruce lo dice ------------------------------------------------------
--
-- Cambian tres expresiones y se suma una columna al final; el resto queda
-- palabra por palabra igual a 0009_fixture_detalle.sql, que es lo único que
-- `create or replace view` permite (los nombres, el orden y los tipos de las
-- columnas no se pueden tocar).
--
--   * `team_a_win` / `team_b_win` pasan a contemplar el W.O. Sin eso la ficha
--     dibujaría los dos nombres en gris, como un cruce sin resultado: el
--     ganador se pone en negrita y el ausente en rojo con esas dos columnas.
--   * `winner_team_id` incluye al que ganó sin jugar.
--   * `status` suma 'w.o.', que es lo que separa "no se jugó todavía" de "no se
--     va a jugar".

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
  coalesce(ra.win, f.walkover_team_id = f.team_a_id) as team_a_win,

  f.team_b_id,
  tb.name     as team_b_name,
  tb.tag      as team_b_tag,
  tb.logo_url as team_b_logo,
  rb.kills    as team_b_kills,
  coalesce(rb.win, f.walkover_team_id = f.team_b_id) as team_b_win,

  m.played_at,
  m.game_length_ms,
  m.ended_in_surrender,

  case
    when f.walkover_team_id is not null then f.walkover_team_id
    when ra.win then f.team_a_id
    when rb.win then f.team_b_id
  end as winner_team_id,

  case
    when f.walkover_team_id is not null then 'w.o.'
    when f.match_id is null then 'pendiente'
    when ra.win is null and rb.win is null then 'sin resultado'
    else 'jugado'
  end as status,

  public.team_university_tags(f.team_a_id) as team_a_universities,
  public.team_university_tags(f.team_b_id) as team_b_universities,

  -- Nueva: quién se quedó con el cruce sin jugarlo. La página la necesita
  -- aparte de `winner_team_id` para escribir "W.O." donde iría el marcador.
  f.walkover_team_id
from public.fixtures f
join public.teams ta on ta.id = f.team_a_id
join public.teams tb on tb.id = f.team_b_id
left join public.matches m on m.id = f.match_id
left join public.team_match_results ra on ra.match_id = f.match_id and ra.team_id = f.team_a_id
left join public.team_match_results rb on rb.match_id = f.match_id and rb.team_id = f.team_b_id;

comment on view public.fixture_results is
  'El fixture con el resultado de cada cruce: el marcador en kills si se jugo, o quien gano por no presentacion del rival.';

-- --- 4. La tabla suma las dos clases de resultado -----------------------------
--
-- Hasta ahora la tabla salía de un solo lugar, `team_match_results`, o sea de
-- las partidas. Ahora hay dos clases de resultado y se juntan en un CTE antes
-- de agrupar; de la cintura para abajo la vista es la misma que en
-- 0010_stats.sql.
--
-- Un W.O. son DOS filas y no una: la victoria del que se presentó y la derrota
-- del que no. Sin la segunda, el ausente no sumaría la derrota y adentro de un
-- grupo el total de victorias dejaría de dar igual al de derrotas — que es
-- justo la condición que `team_standings` cuidaba con su
-- `opponent_team_id is not null`.
--
-- `games` pasa de `count(r.match_id)` a `count(r.win)`. Para las partidas es lo
-- mismo (el filtro ya exigía las dos cosas), y para el W.O. es la diferencia
-- entre contarlo como partido jugado y no contarlo. Un equipo que ganó dos y
-- perdió una por no presentarse jugó tres fechas.

create or replace view public.group_standings with (security_invoker = on) as
with resultados as (
  -- Lo que se jugó.
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
  -- Lo que se dio por ganado. La fecha es la del cruce y no la de cuando se
  -- cargó: `form` y `last_played_at` ordenan por ahí, y lo que corresponde es
  -- que el W.O. caiga en la fecha en que se tendría que haber jugado.
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
)
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
left join resultados r on r.team_id = t.id and r.group_label = t.group_label
where t.group_label is not null
group by t.tournament_id, t.group_label, t.id, t.name, t.tag, t.logo_url,
         u.id, u.name, u.tag, u.logo_url;

comment on view public.group_standings is
  'La tabla de cada grupo. Suma lo jugado y lo ganado por no presentacion; el W.O. cuenta partido, victoria y derrota, pero no kills ni oro.';

-- --- 5. Asignar una partida a un cruce dado por ganado ------------------------
--
-- El check de arriba lo impide, pero chocar contra un constraint devuelve un
-- error de Postgres que en el panel se lee como una falla del sistema y no como
-- lo que es: dos afirmaciones contradictorias sobre el mismo partido, que las
-- tiene que mirar una persona.
--
-- Se re-declara la función entera porque plpgsql no tiene forma de agregarle un
-- pedazo. Lo único nuevo son las siete líneas marcadas; el resto es igual a
-- 0012_planteles.sql.

create or replace function public.assign_match_to_fixture(
  p_match_id      uuid,
  p_fixture_id    uuid,
  p_blue_team_id  uuid default null
)
returns jsonb
language plpgsql
as $$
declare
  v_fixture   public.fixtures%rowtype;
  v_blue      uuid;
  v_red       uuid;
  v_other     uuid;
  v_learned   integer := 0;
  v_matched   integer := 0;
  v_conflicts text[];
begin
  select * into v_fixture from public.fixtures where id = p_fixture_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Ese cruce no existe.');
  end if;

  if not exists (select 1 from public.matches where id = p_match_id) then
    return jsonb_build_object('ok', false, 'error', 'Esa partida no existe.');
  end if;

  -- LO NUEVO. Un cruce dado por ganado no se jugó; si apareció un replay, una
  -- de las dos cosas está mal cargada.
  if v_fixture.walkover_team_id is not null then
    return jsonb_build_object(
      'ok', false,
      'error', 'Este cruce está cargado como no presentado. Si se jugó, sacá el W.O. primero.'
    );
  end if;

  v_blue := p_blue_team_id;

  if v_blue is null then
    v_blue := public.side_team(p_match_id, 100::smallint);
  end if;

  if v_blue is null then
    v_other := public.side_team(p_match_id, 200::smallint);
    v_blue := case
                when v_other = v_fixture.team_a_id then v_fixture.team_b_id
                when v_other = v_fixture.team_b_id then v_fixture.team_a_id
              end;
  end if;

  if v_blue is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'No se puede deducir quien jugo de azul: hay que elegirlo.'
    );
  end if;

  if v_blue = v_fixture.team_a_id then
    v_red := v_fixture.team_b_id;
  elsif v_blue = v_fixture.team_b_id then
    v_red := v_fixture.team_a_id;
  else
    return jsonb_build_object('ok', false, 'error', 'Ese equipo no juega este cruce.');
  end if;

  update public.fixtures set match_id = null
   where match_id = p_match_id and id <> p_fixture_id;

  update public.fixtures set match_id = p_match_id where id = p_fixture_id;

  update public.matches
     set blue_team_id  = v_blue,
         red_team_id   = v_red,
         tournament_id = v_fixture.tournament_id,
         stage_label   = v_fixture.group_label,
         round_label   = 'Fecha ' || v_fixture.matchday
   where id = p_match_id;

  update public.match_players
     set team_id = case when side = 100 then v_blue else v_red end
   where match_id = p_match_id;

  with alta as (
    insert into public.team_members (team_id, player_id)
    select case when mp.side = 100 then v_blue else v_red end, mp.player_id
      from public.match_players mp
     where mp.match_id = p_match_id
       and mp.player_id is not null
       and not exists (
         select 1 from public.team_members tm
          where tm.player_id = mp.player_id and tm.left_at is null
       )
    returning 1
  )
  select count(*) into v_learned from alta;

  select coalesce(array_agg(distinct coalesce(p.display_name, p.riot_game_name)), '{}')
    into v_conflicts
    from public.match_players mp
    join public.players p on p.id = mp.player_id
    join public.team_members tm on tm.player_id = mp.player_id and tm.left_at is null
   where mp.match_id = p_match_id
     and tm.team_id <> (case when mp.side = 100 then v_blue else v_red end);

  v_matched := public.link_roster_accounts(v_blue) + public.link_roster_accounts(v_red);

  return jsonb_build_object(
    'ok', true,
    'blue_team_id', v_blue,
    'red_team_id', v_red,
    'matchday', v_fixture.matchday,
    'group_label', v_fixture.group_label,
    'learned', v_learned,
    'matched', v_matched,
    'conflicts', to_jsonb(v_conflicts)
  );
end;
$$;
