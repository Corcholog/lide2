/**
 * Compares the replays bucket against the database and reports orphan objects.
 *
 * Mind what "orphan" means: the files of a failed ingest have no match_files
 * row either, but they are kept on purpose so the ingest can be retried. Only
 * what is in neither match_files nor ingest_failures counts as an orphan.
 *
 *   npm run storage:audit
 *   npm run storage:audit -- --fix     (deletes the orphans)
 */
import { REPLAYS_BUCKET } from '../src/lib/env'
import { createAdminClient } from '../src/lib/supabase/admin'

async function listObjects(prefix: string): Promise<{ path: string; size: number }[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.storage
    .from(REPLAYS_BUCKET)
    .list(prefix, { limit: 1000, sortBy: { column: 'name', order: 'asc' } })

  if (error) throw new Error(error.message)

  const results: { path: string; size: number }[] = []
  for (const entry of data ?? []) {
    // A folder carries no metadata; you have to go one level down.
    if (!entry.metadata) {
      results.push(...(await listObjects(prefix ? `${prefix}/${entry.name}` : entry.name)))
    } else {
      results.push({
        path: prefix ? `${prefix}/${entry.name}` : entry.name,
        size: Number(entry.metadata.size ?? 0),
      })
    }
  }
  return results
}

async function main() {
  const fix = process.argv.includes('--fix')
  const supabase = createAdminClient()

  const objects = await listObjects('')

  const [files, failures] = await Promise.all([
    supabase.from('match_files').select('storage_path'),
    supabase.from('ingest_failures').select('storage_path'),
  ])

  const known = new Set<string>()
  for (const row of files.data ?? []) known.add(row.storage_path as string)
  for (const row of failures.data ?? []) {
    if (row.storage_path) known.add(row.storage_path as string)
  }

  const orphans = objects.filter((o) => !known.has(o.path))
  const totalMb = objects.reduce((acc, o) => acc + o.size, 0) / 1048576
  const orphanMb = orphans.reduce((acc, o) => acc + o.size, 0) / 1048576

  console.log(`\n  ${objects.length} objects in the bucket · ${totalMb.toFixed(1)} MB`)
  console.log(`  ${files.data?.length ?? 0} referenced by match_files`)
  console.log(`  ${failures.data?.length ?? 0} from failed ingests (kept for a retry)`)
  console.log(`  ${orphans.length} orphans · ${orphanMb.toFixed(1)} MB\n`)

  if (orphans.length === 0) return

  for (const orphan of orphans) {
    console.log(`    ${orphan.path}  ${(orphan.size / 1048576).toFixed(1)} MB`)
  }

  if (!fix) {
    console.log('\n  Run it again with --fix to delete them.\n')
    return
  }

  const { error } = await supabase.storage.from(REPLAYS_BUCKET).remove(orphans.map((o) => o.path))
  if (error) throw new Error(error.message)

  console.log(`\n  ${orphans.length} objects deleted · ${orphanMb.toFixed(1)} MB freed\n`)
}

main()
