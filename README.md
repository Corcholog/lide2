# LIDE 2

Sitio **no oficial** para seguir el estado de la LIDE 2, el torneo universitario argentino de
League of Legends: la tabla de cada grupo, el fixture fecha por fecha, los playoffs, las
estadísticas del torneo y la ficha de cada equipo y cada jugador.

No pertenece a la organización del torneo ni la representa. La información sale de los anuncios y
las planillas oficiales, pero la página la mantiene otra gente: si algo no coincide, mandan los
canales del torneo.

## Qué se ve

- **Portada** — la próxima fecha, la tira de las 13 universidades, la tabla de los cuatro grupos y
  el fixture completo. Se puede fijar un equipo con un clic y quedan resaltados todos sus cruces.
- **Fase de grupos** — victorias, derrotas y diferencia de kills. Clasifican los dos primeros de
  cada grupo. Al ser partidos únicos no hay diferencia de games: el desempate es por kills.
- **Estadísticas** — rankings por jugador, por equipo y por universidad, con MVP por fecha.
- **Equipos** — el plantel en cinco puestos fijos más el banco, que se va completando solo a medida
  que se cargan las partidas.

## Correr el proyecto

```bash
npm install
cp .env.example .env.local     # completar con las claves del proyecto de Supabase
npm run dev
```

Para la base: `npm run db:sql` imprime todas las migraciones juntas, listas para pegar en el SQL
editor de Supabase. El usuario del panel se crea a mano en Authentication → Users.

```bash
npm test          # no necesita Docker ni un proyecto de Supabase
npm run build
```

Las pruebas de esquema levantan un Postgres embebido (PGlite, WASM), aplican las migraciones de
verdad y ejercitan la carga completa.

## Desplegar

Anda en Vercel sin configuración extra. Las tres variables de `.env.example` van en el proyecto de
Vercel; `SUPABASE_SECRET_KEY` **nunca** con prefijo `NEXT_PUBLIC_`, que la deja viajar al browser.

El dominio se detecta solo (`VERCEL_PROJECT_PRODUCTION_URL`) y se usa para las vistas previas al
compartir el link. El login es por usuario y contraseña, así que no hay URLs de redirección que
configurar en Supabase.

## Cómo está armado

Next.js con App Router, Supabase (Postgres + Auth + Storage) y Tailwind. El panel de administración
vive bajo `/admin` y pide sesión; todo lo demás es público.

- `src/app/(app)/` — las páginas. La portada sólo consulta y compone; cada sección se dibuja sola
  desde `src/components/home/`.
- `src/lib/stats/` — el catálogo de estadísticas. Sumar un ranking es escribir su función y agregar
  una línea en `registry.ts`; la página lo dibuja sola.
- `src/components/` — los componentes, agrupados por dominio (`home/`, `stats/`, `match/`,
  `tournament/`, `admin/`).
- `supabase/migrations/` — el esquema, en orden. Se aplican de a una y nunca se editan hacia atrás.

El código está en inglés —nombres, comentarios y todo— y lo que se ve o se comparte, en castellano:
los textos de la interfaz, las rutas (`/equipos`, `/partidas`) y los parámetros de la URL
(`?fecha=2`, `?orden=winrate`). El esquema de la base ya estaba en inglés.

## Decisiones que conviene conocer antes de tocar el código

- **Lo público sale por vistas, no por tablas.** Las 15 tablas tienen RLS y sólo 8 son legibles sin
  sesión. Todo lo que ve un visitante —tabla, fixture, estadísticas, planteles— pasa por vistas que
  corren con permisos de dueño y exponen únicamente lo que puede ser público. Los nombres de los
  inscriptos son nombres legales de personas reales y no salen nunca; de la tabla de inscriptos, la
  vista del plantel sólo lee *cuántos* son (ver `supabase/migrations/0013_publico.sql`).
- **Un equipo puede representar a varias universidades.** Cuatro de los veinte se armaron con
  inscripciones sueltas y juntan hasta tres. Por eso los rankings por universidad se miden por
  aparición de jugador y no por partido: no hay forma correcta de decidir de quién es un partido que
  jugaron tres universidades juntas.
- **El resaltado de equipos es CSS, no estado de React.** El árbol del fixture lo dibuja el servidor
  y no se vuelve a renderizar nunca; lo único que cambia al hacer clic es un atributo. Con estado,
  cada movimiento del mouse re-renderizaría las cuarenta filas.
- **Los logos de las universidades traen el fondo adentro del archivo.** Vienen de cada universidad
  con fondos blancos, transparentes y de color; sobre el tema oscuro unos quedaban como un recuadro
  blanco y los escudos de tinta negra directamente no se veían. `scripts/normalize-logos.ts` los
  deja a todos de 256x256 sobre blanco.
