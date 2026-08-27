-- ===========================================================================
-- El plantel de cada equipo, con los casilleros vacios a la vista.
--
-- Hasta ahora la ficha de un equipo mostraba "roster detectado": las cuentas de
-- Riot que la ingesta fue encontrando, en el orden en que salieran. Sirve para
-- el panel, pero para un visitante no dice nada. Un equipo del que todavia no
-- se subio ningun replay se ve vacio, y uno con tres partidas se ve incompleto
-- sin que se entienda que falta.
--
-- Lo que se muestra ahora es la formacion: cinco lugares fijos —Top, Jungla,
-- Mid, ADC, Soporte— mas los suplentes que tenga anotados el equipo. Cada lugar
-- trae el nick de quien lo juega si ya se sabe, y si no queda el lugar con el
-- nombre del rol. El plantel se completa solo a medida que entran los replays.
--
-- QUE SALE DE team_roster Y QUE NO. La vista corre como su dueno (definer) y
-- toca team_roster, que es privada porque son nombres legales de personas
-- reales. Lo unico que le pide es COUNT(*): cuantos anoto el equipo, para saber
-- cuantos lugares de suplente dibujar. Sale un numero por equipo y nada mas —
-- ni un nombre, ni cuales estan emparejados. Lo mismo que ya hace
-- player_university_id() en 0010_stats.sql, que lee la tabla y devuelve un uuid
-- de universidad.
-- ===========================================================================

-- --- 1. El soporte se llama SUPPORT ------------------------------------------
--
-- El .rofl escribe UTILITY en TEAM_POSITION, que es como Riot nombra al soporte
-- ahi adentro. En el resto de Riot —y en como habla cualquiera que juegue— ese
-- rol es el support. Tener el mismo rol con dos nombres es una fuente de bugs
-- silenciosos: `mode() within group (order by position)` los cuenta como roles
-- distintos, el quinteto de la pagina de estadisticas los busca por igualdad de
-- texto y un rotulo que no este en la tabla de traduccion sale crudo en la web.
--
-- Adentro del proyecto hay un solo nombre, SUPPORT, y entra normalizado desde
-- el parser (ver normalizePosition en src/lib/rofl/normalize.ts). Esto arregla
-- lo que ya estaba cargado. `match_players.raw` no se toca: ahi sigue el JSON
-- del replay tal cual, con UTILITY incluido.

update public.match_players
   set position = 'SUPPORT'
 where position is not null
   and upper(btrim(position)) = 'UTILITY';

-- Y que no vuelva a entrar. La normalizacion de verdad esta en el parser, pero
-- el parser no es el unico que escribe aca: estan los scripts de seed, un
-- backfill a mano desde el SQL editor y cualquier cosa que se agregue despues.
-- Un trigger de una linea deja la regla en el unico lugar por el que pasan
-- todas las filas.

create or replace function public.normalize_position()
returns trigger
language plpgsql
as $$
begin
  if new.position is not null and upper(btrim(new.position)) = 'UTILITY' then
    new.position := 'SUPPORT';
  end if;
  return new;
end;
$$;

create trigger match_players_normalize_position
  before insert or update of position on public.match_players
  for each row execute function public.normalize_position();

comment on function public.normalize_position() is
  'El soporte se guarda siempre como SUPPORT. El .rofl lo llama UTILITY.';

-- --- 2. La formacion ---------------------------------------------------------
--
-- Se arma en cuatro pasos:
--
--   1. Cuanto jugo cada cuenta en cada rol, con la camiseta de ese equipo.
--   2. El rol de cada cuenta es el que mas repitio. Un jugador que rota queda
--      en la linea que mas jugo, que es la misma regla que usan las vistas de
--      estadisticas.
--   3. En cada rol, el titular es el que mas veces lo jugo. El resto —y los que
--      todavia no jugaron nunca, que no tienen rol— van al banco.
--   4. Los lugares: cinco fijos siempre, y tantos suplentes como haga falta
--      para que entren todos los anotados y todas las cuentas que sobraron.
--
-- Los lugares existen aunque no haya nadie: es una vista de casilleros, no de
-- jugadores. Un equipo sin un solo replay subido devuelve igual sus cinco
-- filas, con player_id en null.

create view public.team_lineup with (security_invoker = off) as
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
-- El rol de cada cuenta. El desempate por nombre de rol no significa nada, pero
-- que sea estable si: sin el, un jugador con dos lineas empatadas cambiaria de
-- casillero en cada consulta.
rol as (
  select distinct on (team_id, player_id) team_id, player_id, role, games as role_games
    from por_rol
   order by team_id, player_id, games desc, role
),
cuentas as (
  select tm.team_id,
         tm.player_id,
         coalesce(pa.games, 0)      as games,
         r.role,
         coalesce(r.role_games, 0)  as role_games
    from public.team_members tm
    left join partidas pa on pa.team_id = tm.team_id and pa.player_id = tm.player_id
    left join rol      r  on r.team_id  = tm.team_id and r.player_id  = tm.player_id
   where tm.left_at is null
),
-- El titular de un rol es el que mas veces lo jugo. Por partidas en ese rol y no
-- por partidas totales: entre un mid que ademas cubrio tres veces el top y un
-- top que jugo cinco de top, el top es el otro.
--
-- Cuando dos jugadores se turnan las mismas dos lineas y quedan empatados, los
-- dos apuntan al mismo rol, uno se lo lleva y el otro cae al banco: el rol que
-- soltaron queda vacio. Es raro y no se pierde a nadie —sigue en el plantel,
-- abajo—, pero es el precio de resolver cada cuenta por separado en vez de
-- repartir los cinco lugares de una.
ordenadas as (
  select c.*,
         row_number() over (
           partition by c.team_id, c.role
           order by c.role_games desc, c.games desc, c.player_id
         ) as en_rol
    from cuentas c
),
titulares as (
  select * from ordenadas where role is not null and en_rol = 1
),
-- Al banco van los que quedaron segundos en su rol y los que no tienen rol
-- porque todavia no jugaron. Se ordenan por partidas: el que mas entro, primero.
suplentes as (
  select o.team_id,
         o.player_id,
         o.games,
         row_number() over (partition by o.team_id order by o.games desc, o.player_id) as numero
    from ordenadas o
   where o.role is null or o.en_rol > 1
),
roles (role, slot) as (
  values ('TOP', 1), ('JUNGLE', 2), ('MIDDLE', 3), ('BOTTOM', 4), ('SUPPORT', 5)
),
-- Cuantos lugares de banco dibujar. De la planilla salen los anotados que no
-- entran en los cinco titulares; si ademas aparecieron mas cuentas que esas,
-- mandan las cuentas: una cuenta que jugo no se puede quedar sin lugar.
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
  coalesce(ti.games, su.games, 0)                 as games
from lugares l
left join titulares ti on ti.team_id = l.team_id and ti.role = l.role
left join suplentes su on su.team_id = l.team_id and su.numero = l.sub_number
left join public.players p on p.id = coalesce(ti.player_id, su.player_id);

comment on view public.team_lineup is
  'Los lugares del plantel de cada equipo: cinco roles fijos mas el banco, con el nick de quien ocupa cada uno cuando ya se sabe. Publica: de team_roster solo sale cuantos son.';
