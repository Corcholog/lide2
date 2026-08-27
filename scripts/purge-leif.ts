/**
 * Borra todo lo que quedó de LEIF, para dejar la base sólo con la LIDE 2.
 *
 * LEIF fue otro torneo. Sus 29 partidas se usaron para probar el pipeline
 * mientras no había datos reales; ahora que la LIDE 2 está cargada de verdad,
 * esos resultados sólo ensucian las estadísticas y los listados.
 *
 *   npx tsx --env-file=.env.local scripts/purge-leif.ts              inventario
 *   npx tsx --env-file=.env.local scripts/purge-leif.ts --confirmar  borra
 *
 * Es irreversible: se van los .rofl del bucket, que no se pueden regenerar. Por
 * eso sin `--confirmar` sólo lista lo que tocaría.
 *
 * Qué se borra: las partidas que no son de la LIDE 2, los equipos que no
 * pertenecen a ningún torneo y los jugadores que se queden sin ninguna partida.
 * Se mira por pertenencia y no por nombre, para no depender de cómo se llamó
 * cada cosa.
 */

import { createAdminClient } from '../src/lib/supabase/admin'

const SLUG = 'lide-2'
const BUCKET = 'replays'

const supabase = createAdminClient()
const confirmar = process.argv.includes('--confirmar')

interface Inventario {
  matchIds: string[]
  teamIds: string[]
  playerIds: string[]
  storagePaths: string[]
}

async function inventariar(): Promise<Inventario> {
  const { data: torneo } = await supabase
    .from('tournaments')
    .select('id')
    .eq('slug', SLUG)
    .maybeSingle()

  if (!torneo) {
    throw new Error(`No existe el torneo "${SLUG}". Corré antes: npm run seed:lide2`)
  }

  // Partidas ajenas a la LIDE 2: las sueltas y las de cualquier otro torneo.
  const { data: matches, error: matchError } = await supabase
    .from('matches')
    .select('id')
    .or(`tournament_id.is.null,tournament_id.neq.${torneo.id}`)

  if (matchError) throw new Error(`partidas: ${matchError.message}`)
  const matchIds = (matches ?? []).map((row) => row.id as string)

  // Los archivos hay que leerlos antes de borrar las partidas: el cascade se
  // lleva las filas de match_files y con ellas la ruta en el bucket, dejando los
  // .rofl huérfanos ocupando lugar para siempre.
  const storagePaths: string[] = []
  if (matchIds.length > 0) {
    const { data: files, error: fileError } = await supabase
      .from('match_files')
      .select('storage_path')
      .in('match_id', matchIds)

    if (fileError) throw new Error(`archivos: ${fileError.message}`)
    storagePaths.push(...(files ?? []).map((row) => row.storage_path as string))
  }

  // Equipos que no son de ningún torneo: los que detectó la ingesta de LEIF.
  const { data: teams, error: teamError } = await supabase
    .from('teams')
    .select('id')
    .is('tournament_id', null)

  if (teamError) throw new Error(`equipos: ${teamError.message}`)

  // Jugadores que sólo aparecen en las partidas que se van. Si alguno también
  // jugó una de la LIDE 2, se queda.
  const { data: players, error: playerError } = await supabase.from('players').select('id')
  if (playerError) throw new Error(`jugadores: ${playerError.message}`)

  const { data: sobreviven } = await supabase
    .from('matches')
    .select('id')
    .eq('tournament_id', torneo.id)

  const quedanIds = (sobreviven ?? []).map((row) => row.id as string)
  const conPartidaViva = new Set<string>()

  if (quedanIds.length > 0) {
    const { data: vivos } = await supabase
      .from('match_players')
      .select('player_id')
      .in('match_id', quedanIds)
      .not('player_id', 'is', null)

    for (const row of vivos ?? []) conPartidaViva.add(row.player_id as string)
  }

  return {
    matchIds,
    teamIds: (teams ?? []).map((row) => row.id as string),
    playerIds: (players ?? [])
      .map((row) => row.id as string)
      .filter((id) => !conPartidaViva.has(id)),
    storagePaths,
  }
}

async function borrar(inventario: Inventario): Promise<void> {
  // Primero el storage: si falla, la base queda intacta y se puede reintentar.
  // Al revés quedarían archivos sin ninguna fila que los nombre.
  if (inventario.storagePaths.length > 0) {
    const { error } = await supabase.storage.from(BUCKET).remove(inventario.storagePaths)
    if (error) throw new Error(`bucket ${BUCKET}: ${error.message}`)
    console.log(`  ${inventario.storagePaths.length} archivos .rofl borrados del bucket`)
  }

  // match_players, match_files y match_bans se van por cascade con la partida.
  if (inventario.matchIds.length > 0) {
    const { error } = await supabase.from('matches').delete().in('id', inventario.matchIds)
    if (error) throw new Error(`partidas: ${error.message}`)
    console.log(`  ${inventario.matchIds.length} partidas borradas`)
  }

  // team_members se va por cascade con el equipo.
  if (inventario.teamIds.length > 0) {
    const { error } = await supabase.from('teams').delete().in('id', inventario.teamIds)
    if (error) throw new Error(`equipos: ${error.message}`)
    console.log(`  ${inventario.teamIds.length} equipos borrados`)
  }

  if (inventario.playerIds.length > 0) {
    const { error } = await supabase.from('players').delete().in('id', inventario.playerIds)
    if (error) throw new Error(`jugadores: ${error.message}`)
    console.log(`  ${inventario.playerIds.length} jugadores borrados`)
  }
}

async function main() {
  const inventario = await inventariar()

  console.log('\n  Se va a borrar:')
  console.log(`    ${inventario.matchIds.length} partidas ajenas a la LIDE 2`)
  console.log(`    ${inventario.storagePaths.length} archivos .rofl del bucket "${BUCKET}"`)
  console.log(`    ${inventario.teamIds.length} equipos sin torneo`)
  console.log(`    ${inventario.playerIds.length} jugadores sin ninguna partida viva`)

  if (!confirmar) {
    console.log('\n  Inventario nomás. Para borrar de verdad:')
    console.log('    npx tsx --env-file=.env.local scripts/purge-leif.ts --confirmar\n')
    return
  }

  console.log('')
  await borrar(inventario)
  console.log('\n  Listo: la base queda sólo con la LIDE 2.\n')
}

main().catch((error) => {
  console.error(`\n  ${error instanceof Error ? error.message : error}\n`)
  process.exit(1)
})
