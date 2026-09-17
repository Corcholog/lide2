-- ===========================================================================
-- University logos.
--
-- Served from public/ rather than a Storage bucket: cards are exported to PNG
-- with html-to-image, which needs same-origin images (a bucket would require
-- keeping CORS configured), and the files are small and rarely change.
--
-- The path uses the lower-case `tag`, the same convention as the
-- <UniversityLogo> component, which only receives tags. The files are generated
-- by scripts/normalize-logos.ts from assets/universidades/ (the stored column
-- comment names the script's old path; see 0022).
-- ===========================================================================

update public.universities
   set logo_url = '/universidades/' || lower(tag) || '.png';

comment on column public.universities.logo_url is
  'Ruta del logo servido desde public/. Se arma con el tag en minuscula; los archivos los genera scripts/normalizar-logos.ts.';
