-- ===========================================================================
-- Tabla de posiciones.
--
-- El torneo todavia no tiene filas en stages/series: la etapa y la jornada
-- viajan como texto en matches.stage_label ("Bloque B") y matches.round_label
-- ("Fecha 3"), derivadas del nombre del archivo al subirlo (src/lib/ingest/
-- labels.ts). Estas vistas agrupan por esas etiquetas, asi que valen igual si
-- el formato es por bloques, suizo o una sola fase corrida.
--
-- Solo cuentan las partidas con los dos equipos vinculados y con ganador: hasta
-- que el roster este cargado, blue_team_id y red_team_id son null y la partida
-- no le suma a nadie.
-- ===========================================================================

-- --- Una fila por equipo y partida -----------------------------------------
--
-- Da vuelta la partida (azul/rojo) a "equipo vs rival", que es como la miran la
-- tabla de posiciones y la ficha de un equipo. La verdad de quien jugo esta en
-- matches.blue_team_id / red_team_id, que es lo que escribe relink_all_matches().

create view public.team_match_results with (security_invoker = on) as
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
  coalesce(own.turrets, 0)   as turrets
from sides s
join public.matches m on m.id = s.match_id
join public.teams t on t.id = s.team_id
left join public.teams o on o.id = s.opponent_team_id
left join public.match_team_stats own   on own.match_id   = s.match_id and own.side   = s.side
left join public.match_team_stats rival on rival.match_id = s.match_id and rival.side = s.opponent_side;

-- --- Tabla de posiciones por etapa -----------------------------------------
--
-- Desempate: mas victorias, menos derrotas (los equipos pueden llevar distinta
-- cantidad de partidas si una fecha quedo pendiente), diferencia de kills y por
-- ultimo el nombre, para que el orden sea estable entre consultas.
--
-- `form` son los ultimos 5 resultados del mas nuevo al mas viejo, para pintar
-- la rachita de la tabla.

create view public.team_standings with (security_invoker = on) as
select
  r.stage_label,
  r.team_id,
  r.team_name,
  r.team_tag,
  count(*)                                                     as games,
  count(*) filter (where r.win)                                as wins,
  count(*) filter (where not r.win)                            as losses,
  round(count(*) filter (where r.win)::numeric / count(*), 3)  as win_pct,
  sum(r.kills)                                                 as kills,
  sum(r.kills_against)                                         as kills_against,
  sum(r.kills) - sum(r.kills_against)                          as kill_diff,
  sum(r.gold) - sum(r.gold_against)                            as gold_diff,
  round(avg(r.game_length_ms) / 60000.0, 1)                    as avg_minutes,
  min(r.played_at)                                             as first_played_at,
  max(r.played_at)                                             as last_played_at,
  (array_agg(r.win order by r.played_at desc nulls last, r.match_id))[1:5] as form,
  rank() over (
    partition by r.stage_label
        order by count(*) filter (where r.win) desc,
                 count(*) filter (where not r.win) asc,
                 sum(r.kills) - sum(r.kills_against) desc,
                 r.team_name asc
  )                                                            as position
from public.team_match_results r
-- Con un solo lado vinculado la fila existe igual (sirve para el historial del
-- equipo), pero en la tabla no entra: adentro de una etapa el total de
-- victorias tiene que dar igual al de derrotas.
where r.win is not null and r.opponent_team_id is not null
group by r.stage_label, r.team_id, r.team_name, r.team_tag;
