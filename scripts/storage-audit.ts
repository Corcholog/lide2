/**
 * Compara el bucket de replays contra la base y reporta objetos huérfanos.
 *
 * Ojo con qué es "huérfano": los archivos de una ingesta fallida tampoco tienen
 * fila en match_files, pero se conservan a propósito para poder reintentar. Sólo
 * cuenta como huérfano lo que no está ni en match_files ni en ingest_failures.
 *
 *   npm run storage:audit
 *   npm run storage:audit -- --fix     (borra los huérfanos)
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
    // Una carpeta no trae metadata; hay que bajar un nivel.
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

  console.log(`\n  ${objects.length} objetos en el bucket · ${totalMb.toFixed(1)} MB`)
  console.log(`  ${files.data?.length ?? 0} referenciados por match_files`)
  console.log(`  ${failures.data?.length ?? 0} de ingestas fallidas (se conservan para reintentar)`)
  console.log(`  ${orphans.length} huérfanos · ${orphanMb.toFixed(1)} MB\n`)

  if (orphans.length === 0) return

  for (const orphan of orphans) {
    console.log(`    ${orphan.path}  ${(orphan.size / 1048576).toFixed(1)} MB`)
  }

  if (!fix) {
    console.log('\n  Volvé a correrlo con --fix para borrarlos.\n')
    return
  }

  const { error } = await supabase.storage.from(REPLAYS_BUCKET).remove(orphans.map((o) => o.path))
  if (error) throw new Error(error.message)

  console.log(`\n  ${orphans.length} objetos borrados · ${orphanMb.toFixed(1)} MB liberados\n`)
}

main()
