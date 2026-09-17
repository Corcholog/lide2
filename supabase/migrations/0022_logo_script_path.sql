-- ===========================================================================
-- Fix the script path stored in `universities.logo_url`'s comment.
--
-- 0015_logos.sql stored a column comment naming the script that generates the
-- logos. The script was renamed from `scripts/normalizar-logos.ts` to
-- `scripts/normalize-logos.ts`, so the stored comment is corrected here.
--
-- A new migration rather than editing 0015's statement: 0015 already ran
-- against the real database, and changing it would make databases created
-- before and after the edit disagree.
--
-- The comment's text stays in Spanish like the rest of the stored schema
-- comments; only the file name changes.
-- ===========================================================================

comment on column public.universities.logo_url is
  'Ruta del logo servido desde public/. Se arma con el tag en minuscula; los archivos los genera scripts/normalize-logos.ts.';
