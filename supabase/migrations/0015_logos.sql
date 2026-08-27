-- ===========================================================================
-- Los logos de las universidades.
--
-- `universities.logo_url` estaba en null desde 0006 y StatPoster ya tenia el
-- <img> puesto esperandolo ("los logos todavia no estan cargados en el bucket,
-- asi que hoy esto no se dibuja nunca"). Con esto las cards los dibujan solas,
-- sin tocar una linea de TSX.
--
-- POR QUE public/ Y NO EL BUCKET. La idea original era subirlos a Storage. Se
-- quedan en el repo por dos razones. Una es que las cards se exportan a PNG con
-- html-to-image, que dibuja las imagenes en un <canvas>: si vinieran de otro
-- origen habria que sostener la configuracion de CORS del bucket para siempre,
-- y el dia que se rompa la exportacion falla entera. Servidos desde public/ son
-- del mismo origen y el problema no existe. La otra es que son 13 archivos de
-- 206kB en total que cambian una vez por torneo: no ganan nada en una base.
--
-- La ruta se arma con el `tag` en minuscula, que es la convencion que usa
-- tambien el componente <LogoUniversidad> para poder dibujar un logo teniendo
-- solo las siglas (que es lo unico que viaja en `team_university_tags`, en la
-- tabla de posiciones y en el fixture). Los archivos los genera
-- scripts/normalizar-logos.ts a partir de assets/universidades/.
-- ===========================================================================

update public.universities
   set logo_url = '/universidades/' || lower(tag) || '.png';

comment on column public.universities.logo_url is
  'Ruta del logo servido desde public/. Se arma con el tag en minuscula; los archivos los genera scripts/normalizar-logos.ts.';
