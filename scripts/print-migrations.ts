/**
 * Concatenates the migrations into a single file so they can be pasted in one
 * go into Supabase's SQL editor.
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
console.log(`  ${files.length} migrations, ${sql.split('\n').length} lines`)
console.log(`  Paste it into the Supabase project's SQL editor and run it.\n`)
