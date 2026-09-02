/**
 * Deletes everything left over from LEIF, leaving the database with LIDE 2
 * alone.
 *
 * LEIF was another tournament. Its 29 matches were used to exercise the
 * pipeline while there was no real data; now that LIDE 2 is properly loaded,
 * those results only dirty the stats and the listings.
 *
 *   npx tsx --env-file=.env.local scripts/purge-leif.ts            inventory
 *   npx tsx --env-file=.env.local scripts/purge-leif.ts --confirm  deletes
 *
 * It is irreversible: the bucket's .rofl files go, and they cannot be
 * regenerated. That is why without `--confirm` it only lists what it would
 * touch.
 *
 * What gets deleted: the matches that are not LIDE 2's, the teams that belong
 * to no tournament and the players left without a single match. It goes by
 * membership and not by name, so as not to depend on what anything was called.
 */

import { createAdminClient } from '../src/lib/supabase/admin'

const SLUG = 'lide-2'
const BUCKET = 'replays'

const supabase = createAdminClient()
const confirm = process.argv.includes('--confirm')

interface Inventory {
  matchIds: string[]
  teamIds: string[]
  playerIds: string[]
  storagePaths: string[]
}

async function takeInventory(): Promise<Inventory> {
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('id')
    .eq('slug', SLUG)
    .maybeSingle()

  if (!tournament) {
    throw new Error(`Tournament "${SLUG}" does not exist. Run first: npm run seed:lide2`)
  }

  // Matches that are not LIDE 2's: the loose ones and those of any other
  // tournament.
  const { data: matches, error: matchError } = await supabase
    .from('matches')
    .select('id')
    .or(`tournament_id.is.null,tournament_id.neq.${tournament.id}`)

  if (matchError) throw new Error(`matches: ${matchError.message}`)
  const matchIds = (matches ?? []).map((row) => row.id as string)

  // The files have to be read before the matches are deleted: the cascade takes
  // the match_files rows and with them the path in the bucket, leaving the
  // .rofl files orphaned and taking up space forever.
  const storagePaths: string[] = []
  if (matchIds.length > 0) {
    const { data: files, error: fileError } = await supabase
      .from('match_files')
      .select('storage_path')
      .in('match_id', matchIds)

    if (fileError) throw new Error(`files: ${fileError.message}`)
    storagePaths.push(...(files ?? []).map((row) => row.storage_path as string))
  }

  // Teams that belong to no tournament: the ones LEIF's ingest detected.
  const { data: teams, error: teamError } = await supabase
    .from('teams')
    .select('id')
    .is('tournament_id', null)

  if (teamError) throw new Error(`teams: ${teamError.message}`)

  // Players who only appear in the matches that are going. If one also played a
  // LIDE 2 match, they stay.
  const { data: players, error: playerError } = await supabase.from('players').select('id')
  if (playerError) throw new Error(`players: ${playerError.message}`)

  const { data: surviving } = await supabase
    .from('matches')
    .select('id')
    .eq('tournament_id', tournament.id)

  const survivingIds = (surviving ?? []).map((row) => row.id as string)
  const stillPlaying = new Set<string>()

  if (survivingIds.length > 0) {
    const { data: alive } = await supabase
      .from('match_players')
      .select('player_id')
      .in('match_id', survivingIds)
      .not('player_id', 'is', null)

    for (const row of alive ?? []) stillPlaying.add(row.player_id as string)
  }

  return {
    matchIds,
    teamIds: (teams ?? []).map((row) => row.id as string),
    playerIds: (players ?? [])
      .map((row) => row.id as string)
      .filter((id) => !stillPlaying.has(id)),
    storagePaths,
  }
}

async function purge(inventory: Inventory): Promise<void> {
  // Storage first: if it fails, the database is untouched and it can be
  // retried. The other way round would leave files with no row naming them.
  if (inventory.storagePaths.length > 0) {
    const { error } = await supabase.storage.from(BUCKET).remove(inventory.storagePaths)
    if (error) throw new Error(`bucket ${BUCKET}: ${error.message}`)
    console.log(`  ${inventory.storagePaths.length} .rofl files deleted from the bucket`)
  }

  // match_players, match_files and match_bans go by cascade with the match.
  if (inventory.matchIds.length > 0) {
    const { error } = await supabase.from('matches').delete().in('id', inventory.matchIds)
    if (error) throw new Error(`matches: ${error.message}`)
    console.log(`  ${inventory.matchIds.length} matches deleted`)
  }

  // team_members goes by cascade with the team.
  if (inventory.teamIds.length > 0) {
    const { error } = await supabase.from('teams').delete().in('id', inventory.teamIds)
    if (error) throw new Error(`teams: ${error.message}`)
    console.log(`  ${inventory.teamIds.length} teams deleted`)
  }

  if (inventory.playerIds.length > 0) {
    const { error } = await supabase.from('players').delete().in('id', inventory.playerIds)
    if (error) throw new Error(`players: ${error.message}`)
    console.log(`  ${inventory.playerIds.length} players deleted`)
  }
}

async function main() {
  const inventory = await takeInventory()

  console.log('\n  About to delete:')
  console.log(`    ${inventory.matchIds.length} matches that are not LIDE 2's`)
  console.log(`    ${inventory.storagePaths.length} .rofl files from the "${BUCKET}" bucket`)
  console.log(`    ${inventory.teamIds.length} teams with no tournament`)
  console.log(`    ${inventory.playerIds.length} players with no surviving match`)

  if (!confirm) {
    console.log('\n  Inventory only. To actually delete:')
    console.log('    npx tsx --env-file=.env.local scripts/purge-leif.ts --confirm\n')
    return
  }

  console.log('')
  await purge(inventory)
  console.log('\n  Done: the database is left with LIDE 2 alone.\n')
}

main().catch((error) => {
  console.error(`\n  ${error instanceof Error ? error.message : error}\n`)
  process.exit(1)
})
