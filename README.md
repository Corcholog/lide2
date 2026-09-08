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
  cada grupo. Al ser partidos únicos no hay diferencia de games: el desempate es por kills. El
  equipo que no se presenta pierde el cruce sin que se juegue.
- **Partidas** — todas las del torneo, con el marcador completo a un clic en la misma fila y
  filtros por fecha y por equipo.
- **Estadísticas** — cinco secciones: jugadores, equipos, universidades, meta (qué se eligió y qué
  funcionó) y las partidas para recordar, con MVP por fecha. La pestaña **Tablas** tiene las tablas
  largas de jugadores, campeones y equipos, que se filtran por grupo y por rol y se ordenan por
  cualquier columna.
- **Equipos y jugadores** — el plantel en cinco puestos fijos más el banco, que se va completando
  solo a medida que se cargan las partidas, con link a la multibúsqueda de op.gg. Cada jugador
  tiene su ficha, y desde cualquier lado se llega al equipo, a la partida y de vuelta.

## Correr el proyecto

```bash
npm install
cp .env.example .env.local     # completar con las claves del proyecto de Supabase
npm run dev
```

Para la base: `npm run db:sql` imprime todas las migraciones juntas, listas para pegar en el SQL
editor de Supabase. Después `npm run seed:lide2` escribe la estructura del torneo —universidades,
los 20 equipos con su grupo, el fixture completo y el cuadro de playoffs— desde
`src/lib/lide2/tournament.ts`. El usuario del panel se crea a mano en Authentication → Users.

Las partidas entran de a un `.rofl` por `/admin/upload`. Para cargar muchas de una,
`npm run ingest -- fixtures --auto` hace exactamente el mismo camino sin browser, y
`npm run ingest:no-upload` hace lo mismo sin guardar los archivos, que pesan.
`npm run storage:audit` compara el bucket contra la base.

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
- `src/lib/lide2/` — el torneo como lo anunció la organización: equipos, grupos, calendario y sede.
  Es la fuente del seed; las páginas leen de la base y no de acá.
- `src/lib/stats/` — el catálogo de estadísticas. Sumar un ranking es escribir su función y agregar
  una línea en `registry.ts`; la página lo dibuja sola.
- `src/lib/routes.ts` — todas las URLs del sitio, armadas en un solo lugar. A la ficha de un jugador
  se enlaza desde siete pantallas distintas: si cada una escribe la dirección a mano, mover esa
  página es encontrarlas a todas.
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
- **El plantel lo dicen las partidas.** Los nicks y las líneas se cargan a mano antes de la fecha 1
  para que la ficha no esté vacía, pero apenas hay un replay ese replay gana: alguien se cambió el
  nick, dos se cambiaron la línea, entró un suplente que no estaba anotado. Lo cargado a mano no se
  borra —sigue siendo lo único que hay antes de que se juegue—, pero pierde contra el primer replay,
  y el panel lista las novedades para revisarlas (`0023_plantel_dinamico.sql`).
- **El W.O. vive en el cruce, no en `matches`.** El equipo que no se presenta pierde sin que se
  juegue, así que no hay `.rofl` que subir. La salida obvia —una partida trucha de cero minutos—
  aparecería en el listado, en los récords, en el promedio de duración y en la meta de campeones, y
  habría que enseñarle a esquivarla a diez vistas. En cambio el resultado lo guarda el fixture y la
  tabla aprende a sumar dos clases de resultado: `matches` sigue queriendo decir "esto se jugó y hay
  un archivo que lo prueba" (`0024_no_presentado.sql`).
- **Un equipo puede representar a varias universidades.** Cuatro de los veinte se armaron con
  inscripciones sueltas y juntan hasta tres. Por eso los rankings por universidad se miden por
  aparición de jugador y no por partido: no hay forma correcta de decidir de quién es un partido que
  jugaron tres universidades juntas.
- **Resaltar y filtrar es CSS, no estado de React.** El fixture y el listado de partidas los dibuja
  el servidor con todo adentro y no se vuelven a renderizar nunca; lo único que cambia al elegir un
  equipo es un atributo, y una regla se encarga del resto. Con estado, cada movimiento del mouse
  re-renderizaría las cuarenta filas del fixture, y filtrar el listado eran 645 KB de HTML y un
  segundo largo para mostrar un subconjunto de lo que el browser ya tenía. La URL sigue siendo el
  estado —`?equipo=` se puede pegar y las flechas del browser funcionan—; lo que cambió es quién la
  atiende. Sin JavaScript el `<form method="get">` navega de verdad y sale lo mismo.
- **El botón de volver sabe de dónde viniste, por clave y no por ruta.** A la ficha de un equipo se
  llega desde cinco lugares y "← Equipos" mandaba a todos a la misma lista. Ahora el link dice desde
  dónde en un `?desde=`, que se busca en una tabla de destinos cerrada: una ruta tomada tal cual
  viene de la URL es una puerta abierta a mandar al visitante a donde quiera quien escribió el link
  (ver `src/lib/routes.ts`).
- **Filtrar por rol elige qué filas se dibujan, no recalcula los números.** El rol de un jugador o
  de un campeón es la línea en la que más veces se lo vio, no una dimensión de las vistas: un jungla
  que rellenó mid dos veces sigue cargando esos dos partidos en sus promedios, y el pick rate de un
  campeón se sigue midiendo contra todas las partidas del alcance, que es el único denominador que
  lo hace una tasa.
- **Los logos de las universidades traen el fondo adentro del archivo.** Vienen de cada universidad
  con fondos blancos, transparentes y de color; sobre el tema oscuro unos quedaban como un recuadro
  blanco y los escudos de tinta negra directamente no se veían. `scripts/normalize-logos.ts` los
  deja a todos de 256x256 sobre blanco.
