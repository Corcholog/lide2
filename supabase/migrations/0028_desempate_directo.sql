-- ===========================================================================
-- El desempate de la tabla es el enfrentamiento directo, no la diferencia de
-- kills.
--
-- El reglamento (2.2) dice: clasifican los dos equipos de mayor puntaje
-- acumulado por grupo, y los empatados se separan por el enfrentamiento
-- directo; lo que eso no resuelve lo define la organización. La diferencia de
-- kills NO está en el reglamento: entró en 0007 como un criterio razonable
-- cuando no había uno escrito, y se quedó.
--
-- No es un detalle de presentación. La tabla es lo que decide quién va a
-- cuartos y en qué puesto, y la portada ya proyecta el bracket desde acá: con
-- dos criterios distintos —la tabla ordenando por kills y el bracket por el
-- mano a mano— la misma pantalla se contradice a sí misma en cuanto dos
-- equipos terminan igualados, que es justo cuando el desempate importa.
--
-- CÓMO SE CALCULA. Para cada equipo, las victorias contra los equipos que
-- están igualados con él. Entre dos es exactamente el partido entre ellos, que
-- es lo que dice el reglamento. Entre tres o más es la mini liga de los
-- partidos entre ellos, que es la lectura natural de "enfrentamiento directo"
-- cuando son más de dos y se reduce al mano a mano cuando son dos.
--
-- LO QUE SIGUE SIN RESOLVERSE. Tres equipos donde cada uno le ganó al
-- siguiente se llevan una victoria cada uno y la mini liga no los separa. Ese
-- es el caso que el reglamento le pasa a la organización y no hay forma de
-- resolverlo acá. La vista igual tiene que devolver filas en algún orden, así
-- que el último criterio sigue siendo el nombre: es un orden de impresión y no
-- un fallo. El bracket de la portada, que sí puede callarse, se calla.
--
-- POR QUÉ NO SE BORRA `kill_diff`. Sigue siendo la columna que la tabla
-- muestra y es información de verdad sobre cómo juega un equipo. Lo que deja
-- de ser es el criterio que decide, que era lo que estaba mal.
--
-- `team_standings` (0005) no se toca, por el mismo motivo que en 0024: es la
-- tabla vieja, anterior al calendario, que agrupa por `stage_label` y que no
-- lee nadie. Esa no tiene grupos ni reglamento detrás.
-- ===========================================================================

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
      select f.walkover_team_id as team_id, true as win, f.kickoff, f.group_label
        from public.fixtures f
       where f.walkover_team_id is not null
      union all
      select case when f.walkover_team_id = f.team_a_id then f.team_b_id else f.team_a_id end,
             false, f.kickoff, f.group_label
        from public.fixtures f
       where f.walkover_team_id is not null
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
  select f.walkover_team_id,
         case when f.walkover_team_id = f.team_a_id then f.team_b_id else f.team_a_id end,
         f.group_label
    from public.fixtures f
   where f.walkover_team_id is not null
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

comment on view public.group_standings is
  'La tabla de cada grupo. Ordena por victorias y desempata por el enfrentamiento directo, como el reglamento; la diferencia de kills se muestra pero no decide.';
