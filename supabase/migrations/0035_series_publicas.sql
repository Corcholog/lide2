-- ===========================================================================
-- Restores public access to playoff series results.
--
-- 0034 recreated `series_results` with `security_invoker = on`, which overwrote
-- the `security_invoker = false` set in 0013_publico.sql. Because the raw
-- `matches` table has RLS enabled with no SELECT policy for `anon`, anonymous
-- visitors saw 0-0 for every playoff series while authenticated admins saw
-- the real scores (e.g. 2-0).
--
-- Also re-applies `security_invoker = false` to fixture_results and
-- group_standings, which were recreated with `security_invoker = on` in 0031.
-- ===========================================================================

alter view public.series_results  set (security_invoker = false);
alter view public.fixture_results set (security_invoker = false);
alter view public.group_standings set (security_invoker = false);
