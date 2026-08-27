-- LIDE 2: universidades en el fixture y ordinales bien escritos
--
-- Dos arreglos chicos sobre lo que ya esta cargado.

-- --- 1. Ordinales de los slots del bracket -----------------------------------
--
-- Los cuartos se sembraron con etiquetas "1o A" / "2o B". La abreviatura de
-- "primero" en castellano lleva el indicador ordinal masculino: 1º, no "1o" ni
-- "1°" (ese es el simbolo de grado, otro caracter).
--
-- Se arregla con un update y no reescribiendo el bracket porque las series ya
-- estan encadenadas por next_series_id: recrearlas romperia esos vinculos.

update public.series
   set slot_a_label = regexp_replace(slot_a_label, '^([1-4])o ', '\1º '),
       slot_b_label = regexp_replace(slot_b_label, '^([1-4])o ', '\1º ')
 where slot_a_label ~ '^[1-4]o ' or slot_b_label ~ '^[1-4]o ';

-- --- 2. Universidades por equipo, en un solo lugar ---------------------------
--
-- group_standings ya resolvia esto con una subconsulta inline. Al necesitarlo
-- tambien el fixture, se saca a una funcion: una sola definicion de la regla
-- "la lista de team_universities, y si no hay, la universidad suelta del
-- equipo". No es SECURITY DEFINER a proposito, asi que las policies de quien
-- consulta siguen valiendo.

create or replace function public.team_university_tags(p_team_id uuid)
returns text[]
language sql
stable
as $$
  select coalesce(
    (
      select array_agg(u.tag order by tu.order_index, u.tag)
        from public.team_universities tu
        join public.universities u on u.id = tu.university_id
       where tu.team_id = p_team_id
    ),
    (
      select case when u.tag is null then '{}'::text[] else array[u.tag] end
        from public.teams t
        left join public.universities u on u.id = t.university_id
       where t.id = p_team_id
    ),
    '{}'::text[]
  );
$$;

comment on function public.team_university_tags(uuid) is
  'Siglas de las universidades de un equipo, la principal primero.';

-- --- 3. Universidades en fixture_results -------------------------------------
--
-- El fixture mostraba solo el nombre del equipo ("Equipo 15"), que no dice nada
-- de quien es. Se agregan las universidades de cada lado, la principal primero,
-- con el mismo criterio que ya usa group_standings: la lista de
-- team_universities si esta cargada, y si no la universidad suelta del equipo.
--
-- La vista se re-declara entera porque create or replace view solo admite sumar
-- columnas al final: todo lo anterior queda igual, palabra por palabra.

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
  ra.win      as team_a_win,

  f.team_b_id,
  tb.name     as team_b_name,
  tb.tag      as team_b_tag,
  tb.logo_url as team_b_logo,
  rb.kills    as team_b_kills,
  rb.win      as team_b_win,

  m.played_at,
  m.game_length_ms,
  m.ended_in_surrender,

  case
    when ra.win then f.team_a_id
    when rb.win then f.team_b_id
  end as winner_team_id,

  case
    when f.match_id is null then 'pendiente'
    when ra.win is null and rb.win is null then 'sin resultado'
    else 'jugado'
  end as status,

  -- Nuevas.
  public.team_university_tags(f.team_a_id) as team_a_universities,
  public.team_university_tags(f.team_b_id) as team_b_universities
from public.fixtures f
join public.teams ta on ta.id = f.team_a_id
join public.teams tb on tb.id = f.team_b_id
left join public.matches m on m.id = f.match_id
left join public.team_match_results ra on ra.match_id = f.match_id and ra.team_id = f.team_a_id
left join public.team_match_results rb on rb.match_id = f.match_id and rb.team_id = f.team_b_id;

-- --- 4. group_standings usa la misma funcion ---------------------------------
--
-- Mismo resultado que antes; lo que cambia es que la regla deja de estar escrita
-- dos veces. Se re-declara entera porque create or replace view exige repetir
-- todas las columnas en el mismo orden.

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
      and r.stage_label = t.group_label
      and r.win is not null
      and r.opponent_team_id is not null
where t.group_label is not null
group by t.tournament_id, t.group_label, t.id, t.name, t.tag, t.logo_url,
         u.id, u.name, u.tag, u.logo_url;
