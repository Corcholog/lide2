# LIDE 2

Sitio **no oficial** para seguir el estado de la LIDE 2, el torneo universitario argentino de
League of Legends: la tabla de cada grupo, el fixture fecha por fecha, los playoffs, las
estadísticas del torneo y la ficha de cada equipo y cada jugador.

No pertenece a la organización del torneo ni la representa. La información sale de los anuncios y
las planillas oficiales, pero la página la mantiene otra gente: si algo no coincide, mandan los
canales del torneo.

## Qué se ve

- **Portada** — la próxima fecha, la tira de las 13 universidades, la tabla de los cuatro grupos,
  el fixture completo y el cuadro de playoffs. Se puede fijar un equipo con un clic y quedan
  resaltados todos sus cruces. Jugada la gran final, el campeón pasa al encabezado.
- **Fase de grupos** — victorias, derrotas y diferencia de kills. Clasifican los dos primeros de
  cada grupo. Los empates se definen por enfrentamiento directo, como dice el reglamento (2.2); con
  tres o más igualados cuentan solo los partidos entre ellos. El equipo que no se presenta pierde el
  cruce sin que se juegue, y un resultado que la organización anula por reglamento cuenta a favor
  del equipo que corresponde.
- **Partidas** — todas las del torneo, con el marcador completo a un clic en la misma fila y
  filtros por fecha y por equipo.
- **Estadísticas** — cinco secciones: jugadores, equipos, universidades, meta (qué se eligió y qué
  funcionó) y las partidas para recordar, con MVP por fecha. La pestaña **Tablas** tiene las tablas
  largas de jugadores, campeones y equipos, que se filtran por grupo y por rol y se ordenan por
  cualquier columna.
- **Equipos y jugadores** — el plantel en cinco puestos fijos más el banco, que se va completando
  solo a medida que se cargan las partidas, con link a op.gg. Cada jugador tiene su ficha, y desde
  cualquier lado se llega al equipo, a la partida y de vuelta.

## Correr el proyecto

```bash
npm install
cp .env.example .env.local     # completar con las claves del proyecto de Supabase
npm run dev
```

Para la base: `npm run db:sql` imprime todas las migraciones juntas, listas para pegar en el SQL
editor de Supabase. Después `npm run seed:lide2` escribe la estructura del torneo —universidades,
los 20 equipos con su grupo, el fixture completo y el cuadro de playoffs— desde
`src/lib/lide2/tournament.ts`. Los inscriptos de cada equipo se cargan sólo si existe
`private/rosters.json`, que no está en el repositorio porque son nombres legales (el formato está
en `src/lib/lide2/rosters.ts`); sin ese archivo se agregan a mano desde `/admin/planteles`. El
usuario del panel se crea a mano en Authentication → Users.

Las partidas entran de a un `.rofl` por `/admin/upload`. Para cargar muchas de una,
`npm run ingest -- fixtures --auto` hace exactamente el mismo camino sin browser, y
`npm run ingest:no-upload` hace lo mismo sin guardar los archivos en el storage.
`npm run storage:audit` compara el bucket contra la base.

```bash
npm test          # no necesita Docker ni un proyecto de Supabase
npm run lint
npm run build
```

Las pruebas de esquema levantan un Postgres embebido (PGlite, WASM), aplican las migraciones reales
y ejercitan la carga completa.

## Desplegar

Anda en Vercel sin configuración extra. Las tres variables obligatorias de `.env.example` van en el
proyecto de Vercel; `SUPABASE_SECRET_KEY` **nunca** con prefijo `NEXT_PUBLIC_`, que la deja viajar
al browser.

El dominio se detecta solo en Vercel (`VERCEL_PROJECT_PRODUCTION_URL`); en otro hosting se define
`NEXT_PUBLIC_SITE_URL`. Se usa para las vistas previas al compartir el link. El login es por usuario
y contraseña, así que no hay URLs de redirección que configurar en Supabase.

## Cómo está armado

Next.js con App Router, Supabase (Postgres + Auth + Storage) y Tailwind. El panel de administración
vive bajo `/admin` y pide sesión; todo lo demás es público.

- `src/app/(app)/` — las páginas. La portada sólo consulta y compone; cada sección se dibuja sola
  desde `src/components/home/`.
- `src/lib/lide2/` — el torneo como lo anunció la organización: equipos, grupos, calendario y sede.
  Es la fuente del seed; las páginas leen de la base y no de acá.
- `src/lib/stats/` — el catálogo de estadísticas. Sumar un ranking es escribir su función y agregar
  una línea en `registry.ts`; la página lo dibuja sola.
- `src/lib/rofl/` — el parser de replays (ver más abajo).
- `src/lib/routes.ts` — todas las URLs del sitio, armadas en un solo lugar.
- `src/components/` — los componentes, agrupados por dominio (`home/`, `stats/`, `match/`,
  `tournament/`, `admin/`).
- `supabase/migrations/` — el esquema, en orden. Se aplican de a una y nunca se editan hacia atrás
  (sólo sus comentarios).
- `scripts/` — tareas de línea de comandos: seed, ingesta masiva, auditoría del storage y generación
  de imágenes.
- `tests/` — pruebas con Vitest; las que tocan la base usan PGlite.

El código está en inglés —nombres y comentarios— y lo que se ve o se comparte, en castellano: los
textos de la interfaz, las rutas (`/equipos`, `/partidas`) y los parámetros de la URL (`?fecha=2`,
`?orden=winrate`). Los nombres de archivo de las migraciones quedaron en castellano: son migraciones ya aplicadas y
no se renombran.

## Decisiones que conviene conocer antes de tocar el código

- **Lo público sale por vistas, no por tablas.** Todas las tablas tienen RLS y sólo las que no
  guardan nada privado son legibles sin sesión. Todo lo que ve un visitante —tabla, fixture,
  estadísticas, planteles— pasa por vistas que corren con permisos de dueño y exponen únicamente lo
  que puede ser público. Los nombres de los inscriptos son nombres legales de personas reales y no
  salen nunca; de la tabla de inscriptos, la vista del plantel sólo lee *cuántos* son (ver
  `supabase/migrations/0013_publico.sql`).
- **El plantel lo dicen las partidas.** Los nicks y las líneas se cargan a mano antes de la fecha 1
  para que la ficha no esté vacía, pero apenas hay un replay ese replay gana. Lo cargado a mano no
  se borra, pero pierde contra el primer replay, y el panel lista las novedades para revisarlas
  (`0023_plantel_dinamico.sql`).
- **El W.O. y los fallos viven en el cruce, no en `matches`.** El equipo que no se presenta pierde
  sin que se juegue, así que no hay `.rofl` que subir: el resultado lo guarda el fixture y la tabla
  suma las dos clases de resultado (`0024_no_presentado.sql`). Un resultado anulado por reglamento
  también vive en el cruce; la partida sigue visible, marcada como anulada, pero no cuenta para
  ninguna estadística (`0031_alineacion_indebida.sql`).
- **El desempate es el enfrentamiento directo.** La tabla de grupos lo resuelve así
  (`0028_desempate_directo.sql`), y lo que esa regla no resuelve queda abierto, porque el reglamento
  se lo deja a la organización.
- **Los cruces de cuartos no se proyectan, se cargan.** La regla 2.3 los define por sorteo
  condicionado, así que el cuadro dice «a sortear» hasta que la organización lo carga en
  `/admin/cruces`; de ahí en adelante el bracket se llena solo (`src/lib/lide2/draw.ts` y el trigger
  de `0006_tournament.sql`).
- **Un equipo puede representar a varias universidades.** Cuatro de los veinte se armaron con
  inscripciones sueltas y juntan hasta tres. Por eso los rankings por universidad se miden por
  aparición de jugador y no por partido.
- **Resaltar y filtrar es CSS, no estado de React.** El fixture y el listado de partidas los dibuja
  el servidor con todo adentro; al elegir un equipo o una fecha cambia un atributo o la URL, y una
  regla CSS se encarga del resto. La URL sigue siendo el estado —se puede pegar y las flechas del
  browser funcionan— y sin JavaScript los filtros navegan de verdad.
- **El botón de volver sabe de dónde viniste, por clave y no por ruta.** El link a la ficha de un
  equipo dice desde dónde en un `?desde=`, que se busca en una tabla de destinos cerrada: una ruta
  tomada tal cual de la URL permitiría mandar al visitante a cualquier lado (ver
  `src/lib/routes.ts`).
- **El rol filtra distinto en campeones y en jugadores.** Para campeones el rol es una dimensión de
  `champion_meta`: con un rol elegido se ven los números de los picks en esa línea
  (`0030_estadisticas_por_rol.sql`). Para jugadores el rol es la línea que más jugaron, y filtrar
  sólo elige qué filas se ven: sus promedios incluyen todas sus partidas.
- **Los logos de las universidades traen el fondo adentro del archivo.** Vienen de cada universidad
  con fondos distintos; `scripts/normalize-logos.ts` los deja a todos de 256x256 sobre blanco para
  que se vean igual en los dos temas y en las imágenes exportadas.

## Dependencias y contenido de terceros

### Riot Games · Data Dragon

Los íconos de campeones, ítems y hechizos, el arte de pantalla de carga y los nombres de los
campeones salen de Data Dragon, el CDN público de Riot (`ddragon.leagueoflegends.com`).

- **Versión.** La lista de versiones (`api/versions.json`) se cachea 24 horas. Cada partida usa la
  versión de Data Dragon de su parche (`16.12` → la primera `16.12.x`), o la última disponible si no
  existe. Si la lista no responde se usa `FALLBACK_VERSION` en `src/lib/ddragon.ts` (hoy `16.17.1`):
  conviene actualizarla de vez en cuando, porque los campeones posteriores a esa versión quedan sin
  ícono.
- **Nombres.** Se piden en castellano (`es_AR`) desde `champion.json` y `summoner.json`. El `.rofl`
  guarda el nombre interno del campeón (`MonkeyKing` para Wukong); las diferencias de mayúsculas se
  resuelven en `CHAMPION_ALIASES`.
- **Imágenes.** Se sirven a través de un proxy propio, `/api/ddragon/...`, con una lista cerrada de
  rutas permitidas y caché de 30 días. Hace falta que sean del mismo origen para exportar las
  piezas de Instagram a PNG sin que el canvas quede bloqueado. El arte de pantalla de carga no lleva
  versión en la ruta.

### Replays `.rofl`

El formato de los replays de League of Legends no está documentado por Riot y puede cambiar con
cualquier parche. El parser (`src/lib/rofl/`) sólo lee la metadata, no la partida grabada:

- Hay dos formatos, que se distinguen por la firma: **ROFL** (viejo, `RIOT 00 00`), con la metadata
  en el encabezado y una tabla de offsets en el byte 262, y **ROFL2** (parche 14.11 en adelante,
  `RIOT 02 00`), con la metadata al final y su longitud en los últimos 4 bytes.
- Se lee por rangos: los primeros 288 bytes y el bloque final, unos 118 KB de un archivo de
  12-17 MB. Por eso el servidor puede parsear directo desde el storage.
- La metadata trae `statsJson`: una entrada por jugador con unos 365 campos, todos como texto. Se
  guarda entera (`match_players.raw`) y sólo se pasan a columnas los que se consultan.
- Los replays grabados entre los parches 13.20 y 14.10 no traen estadísticas.
- No trae el draft (los bans se cargan a mano en `/admin/bans`), ni la skin usada, ni la fecha de la
  partida.
- Una partida se identifica por una huella (PUUID, campeón y KDA de los diez jugadores, más la
  duración), no por el hash del archivo: cada equipo graba su propio `.rofl` de la misma partida.
- Referencias del formato: [roflxd.cs](https://github.com/fraxiinus/roflxd.cs) (MIT) para offsets y
  firmas, y [rofl-parser.js](https://github.com/gzordrai/rofl-parser.js) (Apache-2.0), de donde se
  portó la lógica de lectura.
- Los fixtures de prueba (`fixtures/*.fixture.rofl`) son copias chicas y anonimizadas de replays
  reales, generadas con `npm run fixture`. Los replays reales no se suben al repositorio.

### op.gg

El sitio sólo enlaza a op.gg, no usa su API. Los formatos de URL (multibúsqueda de un equipo y
perfil de un jugador, región `las`, idioma `es`) están en `src/lib/opgg.ts` y los verifica
`tests/opgg.test.ts`; si op.gg cambia sus URLs, se ajustan ahí. El logo de `public/icons/opgg.png`
es de op.gg.

### Otros servicios

- **Supabase** — base de datos Postgres, autenticación y storage de los replays.
- **Vercel** — hosting. Su límite de 4.5 MB por request es la razón por la que los replays se suben
  directo al storage con una URL firmada.
- **Google Maps** — el mapa embebido y los links de la sede de la final
  (`src/lib/lide2/tournament.ts`).
- **Google Fonts** — Geist, Geist Mono y Archivo Black, que `next/font/google` descarga en el build y
  sirve desde el propio sitio.

### Imágenes y marcas

- `public/lide2-hero.jpg` y `public/lide2-poster.jpg` son arte de League of Legends, de Riot Games.
  El pie del sitio lleva el aviso legal que pide la política de contenido de fans de Riot.
- Los escudos de `public/universidades/` pertenecen a cada universidad, y el escudo del torneo
  (`public/icons/page_logo.jfif`, de donde salen el favicon y los íconos) a la organización.
- Las marcas de Twitch y Discord están dibujadas en `src/components/icons/Brands.tsx`.

### Librerías destacadas

Además de Next.js, React, Supabase y Tailwind: `html-to-image` para exportar las piezas a PNG,
`sharp` en los scripts de imágenes, y `@electric-sql/pglite` y Vitest para las pruebas. La lista
completa está en `package.json`.
