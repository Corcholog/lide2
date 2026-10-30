# LIDE 2

Sitio **no oficial** para seguir la LIDE 2, el torneo universitario argentino de League of Legends:
tabla de cada grupo, fixture, playoffs, estadísticas y la ficha de cada equipo y jugador.

No pertenece a la organización del torneo ni la representa. La información sale de los anuncios y
las planillas oficiales, pero la página la mantiene otra gente: si algo no coincide, mandan los
canales del torneo.

## Correr el proyecto

```bash
npm install
cp .env.example .env.local     # completar con las claves del proyecto de Supabase
npm run dev
```

Para la base: `npm run db:sql` imprime todas las migraciones juntas, listas para pegar en el SQL
editor de Supabase. Después `npm run seed:lide2` carga la estructura del torneo (universidades,
equipos, fixture y cuadro de playoffs) desde `src/lib/lide2/tournament.ts`. El usuario del panel se
crea a mano en Authentication → Users.

Los inscriptos de cada equipo son nombres legales, así que no están en el repositorio: se cargan
desde `private/rosters.json` si existe (formato en `src/lib/lide2/rosters.ts`) o a mano desde
`/admin/planteles`.

Las partidas entran de a un `.rofl` por `/admin/upload`. Para cargar muchas de una:
`npm run ingest -- fixtures --auto` (agregar `ingest:no-upload` para no guardar los archivos en el
storage). `npm run storage:audit` compara el bucket contra la base.

```bash
npm test          # no necesita Docker ni Supabase (usa PGlite)
npm run lint
npm run build
```

## Desplegar

Anda en Vercel sin configuración extra. Las variables obligatorias de `.env.example` van en el
proyecto de Vercel; `SUPABASE_SECRET_KEY` **nunca** con prefijo `NEXT_PUBLIC_`. El dominio se
detecta solo en Vercel; en otro hosting se define `NEXT_PUBLIC_SITE_URL`.

## Cómo está armado

Next.js (App Router), Supabase (Postgres + Auth + Storage) y Tailwind. `/admin` pide sesión; todo lo
demás es público.

- `src/app/(app)/` — las páginas.
- `src/components/` — componentes, agrupados por dominio (`home/`, `stats/`, `match/`, `tournament/`,
  `admin/`).
- `src/lib/lide2/` — el torneo según la organización; es la fuente del seed.
- `src/lib/stats/` — catálogo de estadísticas: sumar un ranking es escribir su función y agregarla
  en `registry.ts`.
- `src/lib/rofl/` — parser de replays.
- `src/lib/routes.ts` — todas las URLs del sitio.
- `supabase/migrations/` — el esquema, en orden. Nunca se editan hacia atrás (sólo sus comentarios).
- `scripts/` — seed, ingesta masiva, auditoría del storage, imágenes.
- `tests/` — Vitest; las que tocan la base usan PGlite.

El código está en inglés; lo que se ve o se comparte (textos, rutas como `/equipos`, parámetros como
`?fecha=2`) está en castellano. Las migraciones ya aplicadas conservan su nombre en castellano.

## El sistema de diseño

Tailwind v4, sin `tailwind.config.js`: los tokens viven en el CSS (`src/app/globals.css`), en tres
capas.

1. **Paleta cruda** (`--color-ink-*`, `--color-brand-*`): los valores de la marca, sin uso directo en
   las páginas.
2. **Tokens semánticos** (`--canvas`, `--fg`, `--accent`, `--on-accent`, …): cada uno tiene un valor
   por tema, así que cambiar un color del sitio es cambiar un token y no veinte componentes.
3. **Utilidades**: `@theme inline` los publica como clases (`bg-surface`, `text-fg-soft`) apuntando a
   la variable, de modo que la utilidad sigue al tema activo.

El tema se cambia con `data-theme` en `<html>` y se aplica antes de pintar (`InlineScript`), sin
parpadeo. `dark` y `light` son variantes propias (`@custom-variant`), no el `dark:` por defecto: así el
botón de tema renderiza los dos íconos en el HTML del servidor y no hay markup distinto entre el
render del servidor y el del cliente.

- **Contraste**: cada paso de texto se auditó contra AA en los dos temas, con el ratio anotado en el
  CSS. El texto que va sobre el relleno de acento sale de `--on-accent`, no de un `text-white` suelto.
- **Tipo**: el texto más chico del sitio (`text-2xs`) y las cuatro voces de espaciado
  (`tracking-kicker`, `tracking-label`, `tracking-heading`, `tracking-display`) son tokens: no queda
  un valor arbitrario de tipografía en el markup, salvo en el póster, que es un lienzo de tamaño fijo
  con su propia escala.
- **Esquinas rectas**: la escala de radios es cero y ningún utility de radio aparece en el markup (la
  única excepción es el `rounded-full` de la barra de daño, que es una píldora y no una esquina). El
  `rounded` a secas de Tailwind es un `0.25rem` fijo que ignora los tokens, así que tampoco se usa.
- **Movimiento**: las animaciones cuelgan de `motion-safe:` y las que son infinitas llevan
  `motion-reduce:` como salida. El anillo de foco es global, con `:focus-visible` y `:where()` para
  que cada componente pueda sobrescribirlo.
- **Botones**: `src/components/ui/Button.tsx` define una sola receta (relleno, tipografía, estado
  deshabilitado) y la compone con `tailwind-merge`, así que ningún botón del sitio reimplementa el
  hover ni el deshabilitado.

## Decisiones que conviene conocer

- **Lo público sale por vistas, no por tablas.** Todas las tablas tienen RLS; los visitantes sólo
  leen vistas que exponen lo que puede ser público. Los nombres de los inscriptos nunca salen: la
  vista del plantel sólo lee *cuántos* son (`0013_publico.sql`).
- **El plantel lo dicen las partidas.** Lo cargado a mano llena la ficha antes de la fecha 1, pero
  pierde contra el primer replay (`0023_plantel_dinamico.sql`).
- **W.O. y fallos viven en el cruce, no en `matches`.** No hay `.rofl` que subir
  (`0024_no_presentado.sql`). Una partida anulada por reglamento sigue visible pero no cuenta para
  ninguna estadística (`0031_alineacion_indebida.sql`).
- **Desempate por enfrentamiento directo** (`0028_desempate_directo.sql`); lo que no resuelve queda
  abierto, porque el reglamento se lo deja a la organización.
- **Los cruces de cuartos se cargan, no se proyectan.** Hasta que la organización los carga en
  `/admin/cruces` el cuadro dice «a sortear»; después se llena solo (`src/lib/lide2/draw.ts`).
- **Un equipo puede representar a varias universidades**, por eso los rankings por universidad
  miden apariciones de jugador y no partidos.
- **Resaltar y filtrar es CSS, no estado de React.** El servidor dibuja todo; elegir un equipo o una
  fecha cambia un atributo o la URL. La URL es el estado y sin JavaScript los filtros navegan igual.
- **El botón de volver usa una clave, no una ruta.** `?desde=` se busca en una tabla cerrada de
  destinos para no permitir redirecciones arbitrarias (`src/lib/routes.ts`).
- **El rol filtra distinto en campeones y jugadores.** En campeones es una dimensión de
  `champion_meta` (`0030_estadisticas_por_rol.sql`); en jugadores sólo elige filas y los promedios
  incluyen todas sus partidas.
- **Los logos de las universidades se normalizan** a 256x256 sobre blanco con
  `scripts/normalize-logos.ts`.

## Contenido de terceros

- **Riot Games · Data Dragon.** Íconos, ítems, hechizos, arte y nombres (en `es_AR`) salen de
  `ddragon.leagueoflegends.com`. Cada partida usa la versión de su parche; si la lista de versiones
  no responde se usa `FALLBACK_VERSION` en `src/lib/ddragon.ts`, que conviene actualizar de vez en
  cuando (los campeones posteriores quedan sin ícono). Las imágenes pasan por el proxy propio
  `/api/ddragon/...` para poder exportar las piezas a PNG.
- **Replays `.rofl`.** El formato no está documentado por Riot y puede cambiar con cualquier parche.
  El parser (`src/lib/rofl/`) lee sólo la metadata (ROFL y ROFL2, por rangos de bytes, sin bajar el
  archivo entero) y guarda el `statsJson` completo en `match_players.raw`. No trae el draft (los bans
  se cargan en `/admin/bans`) y los replays de los parches 13.20 a 14.10 no traen estadísticas. Una
  partida se identifica por una huella de sus diez jugadores y la duración, no por el hash del
  archivo. Basado en [roflxd.cs](https://github.com/fraxiinus/roflxd.cs) (MIT) y
  [rofl-parser.js](https://github.com/gzordrai/rofl-parser.js) (Apache-2.0). Los fixtures de prueba
  (`fixtures/*.fixture.rofl`) son copias anonimizadas, generadas con `npm run fixture`; los replays
  reales no se suben.
- **op.gg.** Sólo se enlaza, no se usa su API. Los formatos de URL están en `src/lib/opgg.ts` y los
  verifica `tests/opgg.test.ts`.
- **Servicios.** Supabase (base, auth, storage), Vercel (hosting; su límite de 4.5 MB por request es
  la razón de subir los replays directo al storage), Google Maps (sede de la final) y Google Fonts
  vía `next/font`.
- **Imágenes y marcas.** `public/lide2-hero.jpg` y `public/lide2-poster.jpg` son arte de Riot Games
  (el pie del sitio lleva el aviso legal de su política de fans). Los escudos de
  `public/universidades/` pertenecen a cada universidad y el del torneo a la organización.
