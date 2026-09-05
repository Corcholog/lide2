-- ===========================================================================
-- Para entrar a una estadistica alcanza con haber jugado.
--
-- LO QUE PASABA. `mvp_min_games(true)` devolvia 3 y ese numero decide quien
-- entra al MVP de la fase; la misma regla esta espejada en
-- `minGamesForAverages()` del sitio, que filtra los rankings de promedios
-- (mejor KDA, KDA promedio, menos muertes, dano por minuto, farmeo, oro por
-- minuto, vision). Con una sola fecha jugada nadie llegaba a tres partidas, o
-- sea que las siete tarjetas salian vacias y —como una tarjeta sin filas no se
-- dibuja— /estadisticas mostraba la seccion de jugadores sin MVP y sin ningun
-- promedio, exactamente hasta la tercera fecha.
--
-- POR QUE UNO Y NO DOS. El umbral estaba para que el que jugo una sola y la
-- rompio no encabece un promedio de la fase, y el precio de eso es que ese
-- jugador no aparece en ningun lado. En la fase de grupos de la LIDE 2 hay
-- equipos que en la primera fecha juegan una sola vez: pedir dos los deja
-- afuera enteros —los cinco— de la unica pagina donde se ven los numeros de
-- alguien, y no por como jugaron sino por como cayo el fixture. Entre un
-- ranking desprolijo y un jugador que no existe, la desprolijidad dura una
-- fecha y se acomoda sola: cuando todos tengan tres o cuatro partidas, el que
-- jugo una deja de estar arriba solo.
--
-- El umbral no se borra, se pone en uno. Sigue siendo el unico lugar donde se
-- ajusta, asi que subirlo de nuevo —terminado el torneo, o para las tarjetas
-- que se publican— es cambiar este numero y el de `minGamesForAverages()`, y
-- nada mas.
--
-- LOS DOS LADOS SE TOCAN JUNTOS. El umbral vive en dos lugares porque el MVP
-- lo calcula Postgres y los promedios los arma el sitio. Bajar uno solo dejaria
-- al MVP entrando con una partida y a "mejor KDA" pidiendo tres, sin que nada
-- en la pagina explique por que.
--
-- El parametro se queda aunque hoy los dos casos devuelvan lo mismo:
-- `tournament_mvp` la llama como `mvp_min_games(t.is_total)` y sacarlo obliga a
-- rehacer la vista. Asi, reemplazar la funcion alcanza —es `immutable` y la
-- vista la llama por nombre.
-- ===========================================================================

create or replace function public.mvp_min_games(p_is_total boolean)
returns integer
language sql
immutable
as $$
  -- El `case when p_is_total` de antes ya no distingue nada: los dos recortes
  -- piden lo mismo. Vuelve el dia que el umbral de la fase suba.
  select 1;
$$;

comment on function public.mvp_min_games(boolean) is
  'Partidas minimas para entrar al MVP. Unico lugar donde se ajusta el umbral.';
