-- ===========================================================================
-- Fix the script path stored in `universities.logo_url`'s comment.
--
-- 0015_logos.sql wrote a comment on the column that points whoever inspects
-- the schema at the script which generates the files. That script was renamed
-- from `scripts/normalizar-logos.ts` to `scripts/normalize-logos.ts` when the
-- codebase moved to English, so the comment now names a file that does not
-- exist.
--
-- WHY A MIGRATION AND NOT AN EDIT TO 0015. Applied migrations are not edited
-- backwards: 0015 already ran against the real database, and changing its text
-- would leave a database that was seeded before this commit disagreeing with
-- one seeded after it, with nothing to reconcile them. A migration of its own
-- is what makes both end up in the same place.
--
-- WHAT THIS CANNOT FIX. The same path also appears in a `--` comment at
-- 0015_logos.sql:21. That one is documentation inside an applied migration
-- file, not something stored in the database, so no migration can reach it and
-- it stays stale on purpose. This header is where the correction is recorded
-- for anyone reading the folder in order.
--
-- The comment's text stays in Spanish, like the rest of the schema's comments:
-- what was broken is the file name, and rewriting the sentence would churn a
-- comment on a live database for nothing.
-- ===========================================================================

comment on column public.universities.logo_url is
  'Ruta del logo servido desde public/. Se arma con el tag en minuscula; los archivos los genera scripts/normalize-logos.ts.';
