# LIDE

Webapp de gestión del torneo de League of Legends. Los equipos entregan el `.rofl` de cada partida
como prueba del resultado, y ese mismo archivo es la fuente de estadísticas: su metadata trae un
`statsJson` en texto plano con 365 campos por jugador.

## Cómo funciona el parseo

Desde el parche 14.11 los replays usan el formato **ROFL2**, que guarda la metadata **al final del
archivo**: los últimos 4 bytes son un `uint32 LE` con el largo del bloque JSON que los precede. El
formato viejo (< 14.9) la guarda en el header, con una tabla de offsets en el byte 262. Los dos se
distinguen por la firma: `RIOT\x00\x00` contra `RIOT\x02\x00`.

Como todo lo que necesitamos está en los primeros 288 bytes y en la cola, el servidor lee el archivo
con requests `Range`: **~118 KB de un replay de 15 MB**. Nunca se descarga entero.

La lógica está portada de [rofl-parser.js](https://github.com/gzordrai/rofl-parser.js) (MIT) y
[roflxd.cs](https://github.com/fraxiinus/roflxd.cs), en [`src/lib/rofl/`](src/lib/rofl/).

## Probar el parser sin levantar nada

```bash
npm run parse:rofl -- "ruta/al/replay.rofl"          # tabla con las stats de los 10 jugadores
npm run parse:rofl -- "ruta/al/replay.rofl" --raw    # lista los 365 campos disponibles
npm run parse:rofl -- "ruta/al/replay.rofl" --json   # salida completa normalizada
```

Los `.rofl` reales no se commitean (pesan 12-17 MB y traen PUUIDs y Riot IDs de gente real).
`npm run fixture -- <archivo>` genera una copia chica y anonimizada para los tests.

## Tests

```bash
npm test
```

Corre dos suites, ninguna necesita Docker ni un proyecto de Supabase:

- **parser**: formatos nuevo y viejo, archivos corruptos, replays sin stats, y snapshots contra dos
  replays reales anonimizados del torneo.
- **esquema**: levanta Postgres embebido (PGlite, WASM), aplica las 4 migraciones de verdad y
  ejercita la ingesta completa — deduplicación, vistas, MVP y vinculación de equipos por PUUID.

## Puesta en marcha

1. Crear un proyecto en [supabase.com](https://supabase.com/dashboard).
2. `npm run db:sql` y pegar `supabase/all-migrations.sql` en el SQL editor del proyecto.
3. Copiar `.env.example` a `.env.local` y completar las claves (Settings → API).
4. Crear el usuario admin en Authentication → Users → Add user.
5. `npm run dev`

## Decisiones que conviene conocer antes de tocar el código

- **El archivo nunca pasa por un route handler.** Vercel corta los request bodies en 4.5 MB. El
  browser pide una signed upload URL, sube directo al storage, y recién ahí el servidor parsea.
- **La deduplicación es por huella, no por hash del archivo.** Cada cliente graba su propio `.rofl`,
  así que los archivos de los dos equipos de una misma partida son bytes distintos. La huella se
  calcula sobre PUUID + campeón + KDA de los 10 jugadores (ver
  [`src/lib/rofl/fingerprint.ts`](src/lib/rofl/fingerprint.ts)). El segundo archivo de una partida ya
  cargada se guarda como prueba adicional en `match_files`.
- **`matches.raw_metadata` y `match_players.raw` guardan el JSON completo.** Riot agrega y saca
  campos cada parche; cualquier stat que no esté promovida a columna sale de ahí sin re-subir nada.
- **El payload de ingesta usa los nombres de columna como contrato.** `ingest_match()` arma las filas
  con `jsonb_populate_record`, así que una clave mal escrita se convierte en NULL silencioso. Hay un
  test que compara el payload contra `information_schema`.
- **La tabla de posiciones se arma con etiquetas, no con `stages`/`series`.** La etapa
  («Bloque B») y la fecha («Fecha 3») se derivan del nombre del archivo al subirlo
  ([`src/lib/ingest/labels.ts`](src/lib/ingest/labels.ts)) y la vista `team_standings` agrupa por
  ese texto, así que sirve igual si el formato es por bloques, suizo o una sola fase. Sólo cuentan
  las partidas con los dos equipos vinculados: dentro de una etapa el total de victorias tiene que
  dar igual al de derrotas.

- **La capa de storage está detrás de una interfaz.** El torneo suizo de 20 equipos son ~65 partidas
  ≈ 920 MB, justo en el límite del plan free de Supabase; mudar los `.rofl` a R2 es escribir otro
  adaptador en [`src/lib/storage/`](src/lib/storage/).

## Lo que el `.rofl` no tiene

Bans y draft, first blood, timeline (nada de oro@15 ni gráficos temporales), y la fecha de la
partida — esta última se estima con el `lastModified` del archivo.
