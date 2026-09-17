-- ===========================================================================
-- Matches decide the lineup; hand-entered data is provisional.
--
-- 0020_asignar_posicion.sql made hand assignments beat match data. That holds
-- before matchday 1 but not after: nicks and lanes are entered from messages
-- during the week, and the replays then show nick changes, swapped lanes or
-- unlisted substitutes, which the old rule hid.
--
-- Reversed: played data wins, and hand-entered data fills the lineup until the
-- first replay replaces it.
--
-- This migration:
--
--   1. `team_lineup` inverts the priority and adds `did_not_play`: the account is
--      on the roster, has zero games and its team has already played. Derived,
--      not stored, so it corrects itself when the person plays.
--
--   2. `roster_review` lists issues for the panel: unlisted accounts that
--      played, entered accounts that did not play, and lane changes, with a
--      suggested pairing for nick changes.
--
--   3. `merge_manual_account()` resolves a nick change: the real account takes
--      the signup held by the placeholder, and the placeholder is removed.
--
-- Why 3 is needed: `adopt_manual_accounts()` (0017) handles a nick that matches
-- the replay. When the nick changed there is no match, ingestion creates a new
-- account, and the placeholder (which holds the signup, and so the university)
-- stays at zero games.
-- ===========================================================================

-- --- 0. Which accounts were entered by hand --------------------------------
--
-- Needed to tell "this account appeared and was never entered". It cannot be
-- derived: the `manual:...` placeholder from `add_team_account` (0017)
-- disappears once `adopt_manual_accounts` sets the real PUUID.
--
-- The trigger fires on INSERT only, so the flag survives adoption (an UPDATE of
-- puuid). As with normalize_position() in 0014, the rule lives where every row
-- passes. It checks the puuid prefix rather than changing `add_team_account`,
-- which would have to be redeclared in full.

alter table public.players
  add column if not exists hand_entered boolean not null default false;

comment on column public.players.hand_entered is
  'La cuenta se cargo a mano antes de jugar (0017). Sobrevive a la adopcion del PUUID.';

-- Existing rows. Those still holding the placeholder were entered by hand and
-- have not played; accounts adopted earlier cannot be recovered.
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

-- --- 1. The lineup, played data first --------------------------------------
--
-- Three changes from 0020; the rest is the same:
--
--   * `rol` inverts the coalesce: `coalesce(j.role, m.role)`. Players keep the
--     lane they played; others keep their hand assignment.
--   * `ordenadas` orders by `role_games` first and drops `asignado_a_mano` from
--     the tiebreak: `role_games` is zero for anyone who has not played the
--     lane, so any played lane beats a hand assignment.
--   * `did_not_play` is added, for the "No jugó" badge.
--
-- `role_games` always refers to `role`: both come from the same `rol_jugado`
-- row for played lanes, and it is zero for hand-assigned ones.

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
-- The full join is still needed, as in 0020, to combine accounts present on
-- only one side with those present on both; only the winner changes.
rol as (
  select
    coalesce(j.team_id, m.team_id)     as team_id,
    coalesce(j.player_id, m.player_id) as player_id,
    coalesce(j.role, m.role)           as role,
    coalesce(j.role_games, 0)          as role_games
  from rol_jugado j
  full join rol_manual m on m.team_id = j.team_id and m.player_id = j.player_id
),
-- Whether the team has played, checked against `matches` rather than its
-- players' games: a team that played with five new accounts still played.
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
           -- Played data first. The player_id tiebreak is arbitrary but stable.
           -- Before matchday 1, two accounts hand-assigned to the same lane still
           -- tie and one goes to the bench; the first played match resolves it.
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
  -- New. The slot has an account with no games and the team has played: the nick
  -- was entered by hand and that person did not play. False for everyone before
  -- matchday 1.
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

-- --- 2. Roster issues ------------------------------------------------------
--
-- What to review after uploading a matchday's replays, per team, by `kind`:
--
--   'nueva'         played for this team and is not linked to any signup:
--                   either someone not on the sheet, or someone's new nick.
--   'no_jugo'       on the roster, the team has played, and this account has
--                   not.
--   'cambio_de_rol' played a different lane than the hand assignment. Nothing
--                   to fix (the view already shows the played lane), but the
--                   admin should know.
--
-- An account can appear under two kinds.
--
-- SECURITY: `security_invoker = on`, so it inherits the RLS of `team_members`,
-- `players` and `match_players`, which have no `anon` policy (0001_init.sql and
-- 0013_publico.sql): without a session it returns zero rows. No legal names
-- leave the view: `linked` only says whether a signup is linked, not which, so
-- it would stay safe even if switched to definer.

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
         -- The 0017 placeholder: entered by hand and not yet in any replay. It can
         -- be merged without losing anything.
         (p.puuid like 'manual:%')                  as is_placeholder,
         -- Entered by hand at some point, whether or not it played later.
         -- Separates "appeared from nowhere" from "entered and played".
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
-- Both sides of a pairing.
--
-- Not played: only placeholders. An account that played before but not this
-- matchday is a substitute who sat out, not an old nick, and merging it would
-- delete matches.
--
-- Appeared: played, not entered by hand and not linked to a signup. Without
-- `not hand_entered`, accounts that played under their entered nick would also
-- count, and the "one left on each side" rule would never apply.
sin_jugar  as (select * from cuentas where team_played and games = 0 and is_placeholder),
aparecidas as (select * from cuentas where games > 0 and not hand_entered and not linked),
conteo as (
  select c.team_id,
         (select count(*) from sin_jugar  s where s.team_id = c.team_id) as n_sin_jugar,
         (select count(*) from aparecidas a where a.team_id = c.team_id) as n_aparecidas
    from (select distinct team_id from cuentas) c
),
-- The suggestion. Never applied automatically: an admin confirms it, as with
-- link_roster_accounts, adopt_manual_accounts and assign_roster_account. A wrong
-- pairing credits someone's matches to another university.
--
-- Three reasons, strongest first; the first that yields a single candidate is
-- suggested:
--
--   'mismo_tag'  the #TAG matches. Game names change often, tags rarely.
--   'unica'      exactly one unplayed account and one appeared account on the
--                team.
--   'mismo_rol'  the appeared account played the lane assigned to the unplayed
--                one. Weakest, and last on purpose: a real substitute also plays
--                the lane of the starter they replace.
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

-- --- 3. Merging the old nick -----------------------------------------------
--
-- Example: "PlayerOne#tag" was entered as top during the week; the replay shows
-- "PlayerOne2#tag" played top. Same person, two rows: the placeholder (linked to
-- the signup, no games) and the real account (PUUID and games, no signup).
--
-- The real account is kept and receives the placeholder's signup, not the
-- other way round: the placeholder has nothing worth moving, and the real
-- account has match_players rows attached.
--
-- The hand-entered lane is not carried over: lanes come from matches now, and
-- this account already has one.
--
-- Everything is validated before deleting: a wrong merge cannot be undone, since
-- the placeholder is the only record of what the sheet said.

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

  -- First, both accounts must belong to this team. This guards against more than
  -- a typo: a stale form could merge a stranger's account and credit matches to
  -- the wrong university (rule 1 of assign_roster_account, 0019). It also gives
  -- the most useful error message.
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

  -- Only 0017 placeholders can be merged. An account with a real PUUID has
  -- played, and deleting it would orphan matches.
  if v_ph.puuid not like 'manual:%' then
    return jsonb_build_object(
      'ok', false,
      'error', v_ph_nom || ' ya apareció en un replay: no es un nick cargado a mano y no se puede absorber.'
    );
  end if;

  -- Defensive: a placeholder should have no matches, but if one was edited by
  -- hand, the delete below would orphan them.
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

  -- The signup. If both accounts have different signups, this is not a nick
  -- change but two people, and picking one would be an unnoticed error.
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
    -- Whether the signup moved, i.e. whether the university attribution was
    -- fixed or only a redundant row was removed.
    'roster_moved', (v_roster is not null and v_otro is null)
  );
end;
$$;

comment on function public.merge_manual_account(uuid, uuid, uuid) is
  'Absorbe un nick cargado a mano que nunca jugo dentro de la cuenta de verdad que aparecio en su lugar, y le pasa el inscripto.';

revoke execute on function public.merge_manual_account(uuid, uuid, uuid) from public, anon, authenticated;
