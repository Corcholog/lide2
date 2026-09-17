-- ===========================================================================
-- One game played is enough to appear in a stat.
--
-- `mvp_min_games(true)` returned 3, and `minGamesForAverages()` in the site
-- mirrored it for the average rankings. With one matchday played nobody reached
-- three games, so those cards were empty until the third matchday. Some teams
-- play only once on the first matchday, so even two would leave whole teams
-- out. A single strong game may top an average early on, which evens out as
-- more games are played.
--
-- The threshold is kept, set to one. Change it here and in
-- `minGamesForAverages()` together: the MVP is computed in Postgres and the
-- averages in the site, and changing only one would apply different rules on
-- the same page.
--
-- The parameter stays even though both cases return the same value:
-- `tournament_mvp` calls `mvp_min_games(t.is_total)`, and removing it would
-- require rebuilding the view.
-- ===========================================================================

create or replace function public.mvp_min_games(p_is_total boolean)
returns integer
language sql
immutable
as $$
  -- Both scopes use the same minimum for now.
  select 1;
$$;

comment on function public.mvp_min_games(boolean) is
  'Partidas minimas para entrar al MVP. Unico lugar donde se ajusta el umbral.';
