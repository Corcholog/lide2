-- ===========================================================================
-- El plantel lo dicen las partidas. Lo que se carga a mano es provisional.
--
-- 0020_asignar_posicion.sql puso la asignación a mano POR ENCIMA de lo
-- deducido, con este argumento: "a mano le gana a lo deducido, porque una
-- persona sabe algo que las partidas todavía no mostraron". Era cierto antes
-- de la fecha 1 y deja de serlo apenas se juega.
--
-- Lo que pasa en la vida real: los nicks y las líneas llegan por mensaje
-- durante la semana previa, se cargan a mano para que la ficha no esté vacía, y
-- después se juega. Y ahí aparece que uno cambió de nick y no avisó, que dos
-- se cambiaron la línea entre ellos, o que entró un suplente que no estaba
-- anotado. Con la regla de 0020, todo eso quedaba tapado: la ficha seguía
-- mostrando lo que dijo el formulario de inscripción aunque el replay dijera
-- otra cosa, y no había forma de enterarse salvo mirando la partida.
--
-- Se da vuelta: LO JUGADO GANA, y lo cargado a mano queda como lo que siempre
-- fue, un provisorio que llena la ficha hasta que haya con qué reemplazarlo.
-- La asignación a mano no se borra ni deja de servir —sigue siendo lo único
-- que hay antes de la fecha 1— pero pierde contra el primer replay.
--
-- LAS TRES COSAS DE ESTA MIGRACIÓN:
--
--   1. `team_lineup` invierte la prioridad y suma `did_not_play`: la cuenta
--      está en el plantel, tiene cero partidas y su equipo YA jugó. Es un
--      estado derivado a propósito, no una columna: se corrige solo cuando esa
--      persona juega, no hay que limpiarlo nunca y no se puede trabar.
--
--   2. `roster_review` es la lista de novedades para el panel: quién apareció
--      sin estar anotado, quién no jugó, y a quién le cambió la línea. Con una
--      sugerencia de emparejado para el caso que more duele, el cambio de nick.
--
--   3. `merge_manual_account()` cierra ese caso: la cuenta de verdad se queda
--      con el inscripto que tenía el marcador, y el marcador desaparece.
--
-- POR QUÉ HACE FALTA EL PUNTO 3. `adopt_manual_accounts()` (0017) ya resuelve
-- el caso feliz: si el nick cargado a mano coincide con el del replay, la fila
-- manual recibe el PUUID de verdad y no se duplica nada. Pero si el nick
-- CAMBIÓ no hay coincidencia posible, la ingesta da de alta una cuenta nueva y
-- el marcador queda en cero partidas para siempre. Son dos filas para una sola
-- persona, y la que tiene el vínculo con el inscripto —o sea, con la
-- universidad que suma sus puntos— es justo la que no jugó.
-- ===========================================================================

-- --- 0. Qué cuentas se escribieron a mano ------------------------------------
--
-- Hace falta para poder decir "esta cuenta apareció y vos nunca la anotaste",
-- que es la mitad del emparejado de más abajo. Y no se puede deducir: el
-- marcador `manual:...` que deja `add_team_account` (0017) desaparece en cuanto
-- `adopt_manual_accounts` le pone el PUUID de verdad, así que después de la
-- primera fecha una cuenta tipeada el jueves y una aprendida del replay son la
-- misma fila para cualquier consulta.
--
-- El trigger va sobre el INSERT y nada más. La adopción es un UPDATE que cambia
-- el puuid de 'manual:algo' al de verdad, y justamente lo que se quiere es que
-- la marca sobreviva a eso: la cuenta se sigue habiendo escrito a mano aunque
-- ahora tenga PUUID. Es el mismo patrón que normalize_position() en 0014: la
-- regla vive en el único lugar por el que pasan todas las filas, y no en cada
-- función que escribe.
--
-- Se marca por el prefijo del puuid y no tocando `add_team_account`, que es la
-- única que lo genera, porque plpgsql no deja parchear una función: habría que
-- volver a declararla entera para agregarle una columna a un insert.

alter table public.players
  add column if not exists hand_entered boolean not null default false;

comment on column public.players.hand_entered is
  'La cuenta se cargo a mano antes de jugar (0017). Sobrevive a la adopcion del PUUID.';

-- Lo que ya está cargado. Las que todavía tienen el marcador son, por
-- definición, las que se escribieron a mano y no jugaron; las adoptadas antes
-- de esta migración no se pueden recuperar, y no hace falta: la fecha 1 es hoy.
update public.players set hand_entered = true where puuid like 'manual:%';

create or replace function public.mark_hand_entered()
returns trigger
language plpgsql
as $$
begin
  if new.puuid like 'manual:%' then
    new.hand_entered := true;
  end if;
  return new;
end;
$$;

drop trigger if exists players_mark_hand_entered on public.players;
create trigger players_mark_hand_entered
  before insert on public.players
  for each row execute function public.mark_hand_entered();

comment on function public.mark_hand_entered() is
  'Marca como cargada a mano toda cuenta que nace con el marcador manual: de 0017.';

-- --- 1. La formación, con lo jugado adelante ---------------------------------
--
-- Cambian tres cosas respecto de 0020 y el resto es igual:
--
--   * `rol` invierte el coalesce: `coalesce(j.role, m.role)` en vez de
--     `coalesce(m.role, j.role)`. Quien jugó tiene la línea que jugó; quien no
--     jugó todavía conserva la que se le cargó a mano.
--   * `ordenadas` ordena por `role_games` primero y saca `asignado_a_mano` del
--     desempate. No hace falta más: `role_games` es cero para todo el que no
--     jugó esa línea, así que cualquiera que la haya jugado una vez le gana a
--     cualquier asignación de formulario, que es exactamente la regla nueva.
--   * Sale `did_not_play`, que es lo que la ficha necesita para escribir
--     "No jugó" al lado del nick.
--
-- Ojo con una trampa que no existe: `role_games` siempre corresponde a `role`
-- y no a otra línea. Cuando la fila viene de las partidas los dos salen del
-- mismo renglón de `rol_jugado`; cuando viene del formulario, `role_games` es
-- cero. No hay forma de que diga "MIDDLE" con las cinco partidas de top.

create or replace view public.team_lineup with (security_invoker = off) as
with partidas as (
  select mp.team_id, mp.player_id, count(*) as games
    from public.match_players mp
   where mp.team_id is not null and mp.player_id is not null
   group by mp.team_id, mp.player_id
),
por_rol as (
  select mp.team_id, mp.player_id, mp.position as role, count(*) as games
    from public.match_players mp
   where mp.team_id is not null and mp.player_id is not null and mp.position is not null
   group by mp.team_id, mp.player_id, mp.position
),
rol_jugado as (
  select distinct on (team_id, player_id) team_id, player_id, role, games as role_games
    from por_rol
   order by team_id, player_id, games desc, role
),
rol_manual as (
  select tm.team_id, tm.player_id, tm.role
    from public.team_members tm
   where tm.left_at is null and tm.role is not null
),
-- El full join sigue haciendo falta por lo mismo que en 0020: hay que juntar a
-- quien aparece de un solo lado (jugó pero nadie le cargó nada, o se le cargó
-- y todavía no jugó) con quien aparece de los dos. Lo único que cambia es cuál
-- gana cuando está de los dos.
rol as (
  select
    coalesce(j.team_id, m.team_id)     as team_id,
    coalesce(j.player_id, m.player_id) as player_id,
    coalesce(j.role, m.role)           as role,
    coalesce(j.role_games, 0)          as role_games
  from rol_jugado j
  full join rol_manual m on m.team_id = j.team_id and m.player_id = j.player_id
),
-- Si el equipo ya jugó. Se pregunta por `matches` y no por las partidas de sus
-- jugadores: un equipo que jugó y perdió con cinco cuentas nuevas igual jugó, y
-- lo que decide si "no jugó" quiere decir algo es que haya habido un partido.
jugo_el_equipo as (
  select t.id as team_id,
         exists (
           select 1 from public.matches m
            where m.blue_team_id = t.id or m.red_team_id = t.id
         ) as jugo
    from public.teams t
),
cuentas as (
  select tm.team_id,
         tm.player_id,
         coalesce(pa.games, 0)     as games,
         r.role,
         coalesce(r.role_games, 0) as role_games,
         tm.role                   as assigned_role
    from public.team_members tm
    left join partidas pa on pa.team_id = tm.team_id and pa.player_id = tm.player_id
    left join rol      r  on r.team_id  = tm.team_id and r.player_id  = tm.player_id
   where tm.left_at is null
),
ordenadas as (
  select c.*,
         row_number() over (
           partition by c.team_id, c.role
           -- Lo jugado primero. El desempate por player_id no significa nada,
           -- pero que sea estable sí: sin él, dos cuentas empatadas se
           -- cambiarían de casillero en cada consulta. Antes de la fecha 1 dos
           -- cuentas con la misma línea cargada a mano siguen empatando acá y
           -- una cae al banco; ahora es un empate que se rompe solo apenas se
           -- juegue, y la ficha avisa que lo cargado a mano es provisorio.
           order by c.role_games desc, c.games desc, c.player_id
         ) as en_rol
    from cuentas c
),
titulares as (
  select * from ordenadas where role is not null and en_rol = 1
),
suplentes as (
  select o.team_id,
         o.player_id,
         o.games,
         o.assigned_role,
         row_number() over (partition by o.team_id order by o.games desc, o.player_id) as numero
    from ordenadas o
   where o.role is null or o.en_rol > 1
),
roles (role, slot) as (
  values ('TOP', 1), ('JUNGLE', 2), ('MIDDLE', 3), ('BOTTOM', 4), ('SUPPORT', 5)
),
banco as (
  select t.id as team_id,
         greatest(
           coalesce((select count(*) from public.team_roster r where r.team_id = t.id), 0) - 5,
           coalesce((select count(*) from suplentes s where s.team_id = t.id), 0)
         )::int as lugares
    from public.teams t
),
lugares as (
  select t.id as team_id, r.slot, r.role, null::bigint as sub_number
    from public.teams t
   cross join roles r
  union all
  select b.team_id, 5 + n, null, n
    from banco b, generate_series(1, b.lugares) as n
)
select
  l.team_id,
  l.slot,
  l.role,
  l.sub_number,
  (l.role is null)                                as is_substitute,
  coalesce(ti.player_id, su.player_id)            as player_id,
  coalesce(p.display_name, p.riot_game_name)      as name,
  coalesce(ti.games, su.games, 0)                 as games,
  p.riot_game_name                                as game_name,
  p.riot_tag_line                                 as tag_line,
  coalesce(ti.assigned_role, su.assigned_role)    as assigned_role,
  -- LO NUEVO. Hay alguien en el casillero, no jugó ni una, y el equipo ya
  -- jugó: el nick se cargó a mano y la persona no apareció en la cancha.
  -- Antes de la fecha 1 esto es false para todos, que es lo que corresponde:
  -- no jugó nadie todavía.
  (
    coalesce(ti.player_id, su.player_id) is not null
    and coalesce(ti.games, su.games, 0) = 0
    and e.jugo
  )                                               as did_not_play
from lugares l
join jugo_el_equipo e on e.team_id = l.team_id
left join titulares ti on ti.team_id = l.team_id and ti.role = l.role
left join suplentes su on su.team_id = l.team_id and su.numero = l.sub_number
left join public.players p on p.id = coalesce(ti.player_id, su.player_id);

comment on view public.team_lineup is
  'Los lugares del plantel de cada equipo: cinco roles fijos mas el banco. La linea sale de las partidas jugadas; la cargada a mano es provisoria y pierde contra el primer replay. did_not_play marca al que se cargo a mano y no jugo. Publica: de team_roster solo sale cuantos son.';

-- --- 2. Las novedades del plantel --------------------------------------------
--
-- Lo que hay que mirar después de subir los replays de una fecha, en una sola
-- lista y por equipo. Tres cosas distintas, cada una con su `kind`:
--
--   'nueva'         jugó para este equipo y no está emparejada con ningún
--                   inscripto. O es alguien que no estaba en la planilla, o es
--                   el nick nuevo de alguien que sí estaba.
--   'no_jugo'       está en el plantel, el equipo ya jugó y esta cuenta no
--                   apareció en ninguna partida.
--   'cambio_de_rol' jugó una línea distinta de la que se le cargó a mano. No
--                   hay nada que arreglar —la vista ya muestra la que jugó—
--                   pero quien cargó la planilla se tiene que enterar.
--
-- Una misma cuenta puede salir dos veces con `kind` distinto: alguien que
-- apareció sin estar anotado Y jugó otra línea son dos avisos, no uno.
--
-- SEGURIDAD: `security_invoker = on`, o sea que hereda el RLS de las tablas de
-- abajo. `team_members`, `players` y `match_players` tienen policy `to
-- authenticated` y ninguna `to anon` (0001_init.sql y 0013_publico.sql), así
-- que sin sesión esta vista devuelve cero filas y no hace falta filtrarla del
-- lado de la página. Y no sale de acá ni un nombre legal: `linked` dice si la
-- cuenta está emparejada con un inscripto, no con cuál. Eso último es a
-- propósito, para que la vista siga siendo segura si alguien la pasa a definer
-- mañana sin leer este comentario.

create or replace view public.roster_review with (security_invoker = on) as
with jugo_el_equipo as (
  select t.id as team_id,
         t.name as team_name,
         exists (
           select 1 from public.matches m
            where m.blue_team_id = t.id or m.red_team_id = t.id
         ) as jugo
    from public.teams t
),
partidas as (
  select mp.team_id, mp.player_id, count(*) as games
    from public.match_players mp
   where mp.team_id is not null and mp.player_id is not null
   group by mp.team_id, mp.player_id
),
por_rol as (
  select mp.team_id, mp.player_id, mp.position as role, count(*) as games
    from public.match_players mp
   where mp.team_id is not null and mp.player_id is not null and mp.position is not null
   group by mp.team_id, mp.player_id, mp.position
),
rol_jugado as (
  select distinct on (team_id, player_id) team_id, player_id, role
    from por_rol
   order by team_id, player_id, games desc, role
),
cuentas as (
  select tm.team_id,
         e.team_name,
         tm.player_id,
         tm.role                                    as assigned_role,
         rj.role                                    as played_role,
         coalesce(pa.games, 0)                      as games,
         -- El marcador de 0017: la cuenta se cargó a mano y todavía no apareció
         -- en ningún replay. Es la que se puede absorber sin perder nada.
         (p.puuid like 'manual:%')                  as is_placeholder,
         -- Se escribió a mano alguna vez, haya jugado después o no. Es lo que
         -- separa "apareció de la nada" de "la anotaste y jugó".
         p.hand_entered,
         coalesce(p.display_name, p.riot_game_name) as name,
         p.riot_game_name                           as game_name,
         p.riot_tag_line                            as tag_line,
         exists (
           select 1 from public.team_roster r where r.player_id = tm.player_id
         )                                          as linked,
         e.jugo                                     as team_played
    from public.team_members tm
    join public.players p on p.id = tm.player_id
    join jugo_el_equipo e on e.team_id = tm.team_id
    left join partidas   pa on pa.team_id = tm.team_id and pa.player_id = tm.player_id
    left join rol_jugado rj on rj.team_id = tm.team_id and rj.player_id = tm.player_id
   where tm.left_at is null
),
-- Las dos puntas del emparejado.
--
-- Del lado de las que no jugaron solo entran los marcadores: una cuenta que ya
-- jugó alguna vez y esta fecha no jugó es un suplente que no entró, no un nick
-- viejo, y absorberla borraría partidas.
--
-- Del otro lado, las que aparecieron de la nada: jugaron, nadie las escribió a
-- mano y no son de ningún inscripto. El `not hand_entered` es el que hace que
-- la cuenta sirva: sin él, los cuatro que sí jugaron con el nick que se les
-- había cargado también contarían como candidatos, y la resta de abajo —"quedó
-- una de cada lado"— no daría nunca.
sin_jugar  as (select * from cuentas where team_played and games = 0 and is_placeholder),
aparecidas as (select * from cuentas where games > 0 and not hand_entered and not linked),
conteo as (
  select c.team_id,
         (select count(*) from sin_jugar  s where s.team_id = c.team_id) as n_sin_jugar,
         (select count(*) from aparecidas a where a.team_id = c.team_id) as n_aparecidas
    from (select distinct team_id from cuentas) c
),
-- LA SUGERENCIA. Nunca empareja sola: propone una candidata y la confirma una
-- persona, que es la regla de todo el proyecto (link_roster_accounts,
-- adopt_manual_accounts, assign_roster_account). Emparejar mal le da las
-- partidas de alguien a otra universidad y después no lo ve nadie.
--
-- Tres motivos, del más fuerte al más débil, y se propone el primero que dé
-- una sola candidata:
--
--   'mismo_tag'  el #TAG coincide. Es lo más parecido a evidencia de identidad
--                que hay acá: el game name se cambia seguido, el tag casi nunca.
--   'unica'      quedó exactamente una cuenta sin jugar y exactamente una
--                aparecida en el equipo. Es la resta que haría una persona.
--   'mismo_rol'  la aparecida jugó la línea que tenía cargada la que no jugó.
--                Es el más flojo y va último a propósito: un suplente de verdad
--                entra justo en la línea del titular que reemplaza, así que
--                este motivo confunde los dos casos que hay que distinguir.
sugerencia as (
  select s.team_id,
         s.player_id,
         cand.player_id as suggested_player_id,
         cand.name      as suggested_name,
         cand.reason    as suggested_reason
    from sin_jugar s
    join conteo n on n.team_id = s.team_id
    left join lateral (
      select a.player_id, a.name, 'mismo_tag'::text as reason, 1 as prioridad
        from aparecidas a
       where a.team_id = s.team_id
         and s.tag_line is not null
         and a.tag_line is not null
         and lower(btrim(a.tag_line)) = lower(btrim(s.tag_line))
         and (
           select count(*) from aparecidas x
            where x.team_id = s.team_id
              and lower(btrim(x.tag_line)) = lower(btrim(s.tag_line))
         ) = 1
      union all
      select a.player_id, a.name, 'unica', 2
        from aparecidas a
       where a.team_id = s.team_id
         and n.n_sin_jugar = 1
         and n.n_aparecidas = 1
      union all
      select a.player_id, a.name, 'mismo_rol', 3
        from aparecidas a
       where a.team_id = s.team_id
         and s.assigned_role is not null
         and a.played_role = s.assigned_role
         and (
           select count(*) from aparecidas x
            where x.team_id = s.team_id and x.played_role = s.assigned_role
         ) = 1
      order by prioridad
      limit 1
    ) cand on true
)
select c.team_id, c.team_name, c.player_id, c.name, c.game_name, c.tag_line,
       c.games, c.assigned_role, c.played_role, c.is_placeholder, c.hand_entered, c.linked,
       'no_jugo'::text        as kind,
       g.suggested_player_id,
       g.suggested_name,
       g.suggested_reason
  from cuentas c
  join sugerencia g on g.team_id = c.team_id and g.player_id = c.player_id
 where c.team_played and c.games = 0 and c.is_placeholder

union all

select c.team_id, c.team_name, c.player_id, c.name, c.game_name, c.tag_line,
       c.games, c.assigned_role, c.played_role, c.is_placeholder, c.hand_entered, c.linked,
       'nueva', null::uuid, null::text, null::text
  from cuentas c
 where c.games > 0 and not c.hand_entered and not c.linked

union all

select c.team_id, c.team_name, c.player_id, c.name, c.game_name, c.tag_line,
       c.games, c.assigned_role, c.played_role, c.is_placeholder, c.hand_entered, c.linked,
       'cambio_de_rol', null::uuid, null::text, null::text
  from cuentas c
 where c.games > 0
   and c.assigned_role is not null
   and c.played_role is not null
   and c.played_role <> c.assigned_role;

comment on view public.roster_review is
  'Novedades del plantel de cada equipo despues de jugar: quien aparecio sin estar anotado, quien no jugo y a quien le cambio la linea, con una sugerencia de emparejado para el cambio de nick. Solo con sesion: security_invoker sobre tablas sin policy anon.';

-- --- 3. Absorber el nick viejo -----------------------------------------------
--
-- "Corcho#fkc jugó de top" se cargó a mano el jueves; el domingo el replay dice
-- que quien jugó de top es "Corchito#fkc". Son la misma persona y quedaron dos
-- filas: el marcador, que tiene el vínculo con el inscripto y cero partidas, y
-- la cuenta de verdad, que tiene el PUUID y las partidas pero no está
-- emparejada con nadie.
--
-- LA DIRECCIÓN IMPORTA. Se conserva la cuenta de verdad y se le pasa el
-- inscripto que tenía el marcador, no al revés. El marcador no tiene nada que
-- valga la pena mover —su PUUID es inventado y no tiene ni una partida— y la
-- cuenta de verdad tiene filas de `match_players` colgando: moverla sería
-- rehacer el historial para ahorrarse un update.
--
-- LO QUE NO SE LLEVA: la línea cargada a mano. Después de esta migración las
-- líneas salen de las partidas, y esta cuenta jugó: ya tiene la suya. Copiarle
-- la del formulario sería reponer justo el dato que se acaba de decidir que no
-- manda.
--
-- Se valida todo antes de borrar nada. Un merge equivocado no se deshace: el
-- marcador desaparece y con él la única pista de qué decía la planilla.

create or replace function public.merge_manual_account(
  p_team_id     uuid,
  p_placeholder uuid,
  p_real        uuid
)
returns jsonb
language plpgsql
as $$
declare
  v_ph     public.players%rowtype;
  v_real   public.players%rowtype;
  v_juega  integer;
  v_roster uuid;
  v_otro   uuid;
  v_ph_nom text;
  v_re_nom text;
begin
  if p_placeholder = p_real then
    return jsonb_build_object('ok', false, 'error', 'Son la misma cuenta.');
  end if;

  select * into v_ph from public.players where id = p_placeholder;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'La cuenta vieja no existe.');
  end if;

  select * into v_real from public.players where id = p_real;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'La cuenta nueva no existe.');
  end if;

  v_ph_nom := coalesce(v_ph.display_name, v_ph.riot_game_name, 'esa cuenta');
  v_re_nom := coalesce(v_real.display_name, v_real.riot_game_name, 'esa cuenta');

  -- LO PRIMERO: las dos tienen que ser de este equipo. Va antes que cualquier
  -- otra validación porque es la única que protege de algo peor que un error de
  -- dedo. Sin esto, un formulario viejo o una pestaña abierta de otro equipo
  -- fusiona la cuenta de un desconocido, y de ahí salen partidas atribuidas a
  -- la universidad equivocada sin que nadie lo note. Es la misma regla 1 de
  -- assign_roster_account (0019). Y de paso el mensaje es el útil: "no está en
  -- este equipo" dice qué pasó, y "todavía no jugó" mandaría a mirar otra cosa.
  if not exists (
    select 1 from public.team_members
     where team_id = p_team_id and player_id = p_placeholder and left_at is null
  ) then
    return jsonb_build_object(
      'ok', false,
      'error', v_ph_nom || ' no está en el plantel de este equipo.'
    );
  end if;

  if not exists (
    select 1 from public.team_members
     where team_id = p_team_id and player_id = p_real and left_at is null
  ) then
    return jsonb_build_object(
      'ok', false,
      'error', v_re_nom || ' no está en el plantel de este equipo.'
    );
  end if;

  -- Solo se absorbe un marcador de 0017. Una cuenta con PUUID de verdad jugó
  -- alguna vez, y borrarla dejaría partidas sin dueño.
  if v_ph.puuid not like 'manual:%' then
    return jsonb_build_object(
      'ok', false,
      'error', v_ph_nom || ' ya apareció en un replay: no es un nick cargado a mano y no se puede absorber.'
    );
  end if;

  -- Cinturón y tirantes. El marcador no debería tener partidas por definición,
  -- pero si las tuviera —una fila tocada a mano desde el editor SQL— el delete
  -- de abajo se las dejaría a nadie.
  select count(*) into v_juega from public.match_players where player_id = p_placeholder;
  if v_juega > 0 then
    return jsonb_build_object(
      'ok', false,
      'error', v_ph_nom || ' tiene partidas jugadas: no es un nick pendiente.'
    );
  end if;

  if v_real.puuid like 'manual:%' then
    return jsonb_build_object(
      'ok', false,
      'error', v_re_nom || ' tampoco jugó todavía. Los dos son nicks cargados a mano: borrá el que sobra.'
    );
  end if;

  -- El inscripto. Si lo tienen los dos y son distintos, esto no es un cambio de
  -- nick: son dos personas, y elegir una por su cuenta sería justo el error que
  -- no se ve después.
  select r.id into v_roster from public.team_roster r where r.player_id = p_placeholder;
  select r.id into v_otro   from public.team_roster r where r.player_id = p_real;

  if v_roster is not null and v_otro is not null and v_roster <> v_otro then
    return jsonb_build_object(
      'ok', false,
      'error', 'Cada cuenta ya es de un inscripto distinto. Si de verdad son la misma persona, desemparejá una primero.'
    );
  end if;

  if v_roster is not null and v_otro is null then
    update public.team_roster set player_id = p_real where id = v_roster;
  end if;

  delete from public.team_members where player_id = p_placeholder;
  delete from public.players where id = p_placeholder;

  return jsonb_build_object(
    'ok', true,
    'name', v_re_nom,
    'previous', v_ph_nom,
    -- Si además se movió el inscripto. Es el dato que dice si esto arregló la
    -- atribución de universidad o solo sacó una fila de más.
    'roster_moved', (v_roster is not null and v_otro is null)
  );
end;
$$;

comment on function public.merge_manual_account(uuid, uuid, uuid) is
  'Absorbe un nick cargado a mano que nunca jugo dentro de la cuenta de verdad que aparecio en su lugar, y le pasa el inscripto.';

revoke execute on function public.merge_manual_account(uuid, uuid, uuid) from public, anon, authenticated;
