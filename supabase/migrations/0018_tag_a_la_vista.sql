-- ===========================================================================
-- El #TAG de cada cuenta, tambien para el que mira sin sesion.
--
-- Hasta aca el Riot ID entero se veia solo en el panel: `team_lineup` devolvia
-- un `name` y nada mas, y la ficha del equipo dibujaba ese nombre pelado.
--
-- El nick suelto se repite. Dos "Bruno" en el mismo plantel son dos casilleros
-- identicos, y no hay forma de saber cual es cual sin entrar al panel. Con el
-- tag a la vista alcanza con mirar la pagina, que es donde estan los que no
-- tienen usuario: los propios jugadores.
--
-- Se agregan dos columnas al final —`game_name` y `tag_line`— en vez de una
-- sola con el Riot ID armado. `name` puede ser un alias cargado a mano
-- (`players.display_name`), y en ese caso el tag no va pegado a lo que se
-- muestra sino al nick de Riot: la pagina necesita las dos partes para decidir
-- que dibuja. Nada que no fuera publico antes: `player_profiles` ya expone el
-- mismo par desde 0013_publico.sql.
--
-- Van al final a proposito: `create or replace view` solo deja agregar
-- columnas despues de las que ya estaban.
-- ===========================================================================

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
  -- LO NUEVO: el Riot ID en sus dos partes. Ver el comentario de arriba.
  p.riot_game_name                                as game_name,
  p.riot_tag_line                                 as tag_line
from lugares l
left join titulares ti on ti.team_id = l.team_id and ti.role = l.role
left join suplentes su on su.team_id = l.team_id and su.numero = l.sub_number
left join public.players p on p.id = coalesce(ti.player_id, su.player_id);

comment on view public.team_lineup is
  'Los lugares del plantel de cada equipo: cinco roles fijos mas el banco, con el nick y el #TAG de quien ocupa cada uno cuando ya se sabe. Publica: de team_roster solo sale cuantos son.';
