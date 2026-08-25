/**
 * Junta las migraciones en un solo archivo para poder pegarlas de una en el
 * SQL editor de Supabase.
 *
 *   npm run db:sql
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'

const dir = 'supabase/migrations'
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()

const sql = files
  .map((file) => `-- ${'='.repeat(70)}\n-- ${file}\n-- ${'='.repeat(70)}\n\n${readFileSync(`${dir}/${file}`, 'utf8')}`)
  .join('\n\n')

const out = 'supabase/all-migrations.sql'
writeFileSync(out, sql)

console.log(`\n  ${out}`)
console.log(`  ${files.length} migraciones, ${sql.split('\n').length} líneas`)
console.log(`  Pegalo en el SQL editor del proyecto de Supabase y ejecutalo.\n`)
