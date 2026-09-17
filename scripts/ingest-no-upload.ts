/**
 * Loads replays from disk without uploading them to storage.
 *
 * Same parser, payload and RPC as `npm run ingest`, minus the upload: useful
 * for filling the site with test data without spending storage quota.
 *
 *   npm run ingest:no-upload -- fixtures --dry-run    shows what it would do
 *   npm run ingest:no-upload -- fixtures              loads
 *
 * Without the file there is no `match_files` row, so the match has no .rofl to
 * download and cannot be deduplicated by sha256. Re-running is still safe: the
 * parser's `fingerprint` identifies the match. For real match days use
 * `npm run ingest`.
 */
import { statSync } from 'node:fs'
import { basename } from 'node:path'
import { buildRoundDateMap, deriveLabels } from '../src/lib/ingest/labels'
import { buildIngestPayload } from '../src/lib/ingest/payload'
import { fileSource, normalizeMatch, parseRofl, RoflParseError } from '../src/lib/rofl'
import { createAdminClient } from '../src/lib/supabase/admin'
import { collectReplays } from './lib/replays'

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const targets = args.filter((a) => !a.startsWith('--'))

  if (targets.length === 0) {
    console.error('Usage: npm run ingest:no-upload -- <file.rofl | folder> [--dry-run]')
    process.exit(1)
  }

  const files = targets.flatMap(collectReplays)
  if (files.length === 0) {
    console.error('No .rofl files found under those paths.')
    process.exit(1)
  }

  // Labels come from the path ("16.05 - FECHA 1 (Replays)/..."), as with
  // `npm run ingest -- --auto`. Linking to a matchup still happens in
  // /admin/asignar.
  const roundDates = buildRoundDateMap(files, new Date().getUTCFullYear())

  console.log(`\n  ${files.length} replay(s)${dryRun ? ' (dry run)' : ''}, not uploaded to storage\n`)

  const supabase = createAdminClient()
  let created = 0
  let duplicated = 0
  let failed = 0

  for (const path of files) {
    const name = basename(path)
    process.stdout.write(`    ${name.padEnd(44).slice(0, 44)} `)

    const source = await fileSource(path)
    try {
      const metadata = await parseRofl(source)
      const labels = deriveLabels(path, roundDates)
      const match = normalizeMatch(metadata, {
        fileName: name,
        playedAt: labels.playedAt ?? statSync(path).mtime,
      })

      if (dryRun) {
        const tags = [labels.roundLabel, labels.stageLabel].filter(Boolean).join(' · ')
        console.log(`${match.players.length} players   ${tags || '(no labels)'}`)
        continue
      }

      const payload = buildIngestPayload(match, {
        stageLabel: labels.stageLabel,
        roundLabel: labels.roundLabel,
      })

      const { data, error } = await supabase.rpc('ingest_match', { payload })
      if (error) throw new Error(error.message)

      const result = data as { status: 'created' | 'duplicate'; match_id: string }
      if (result.status === 'created') created++
      else duplicated++

      console.log(result.status === 'created' ? 'loaded' : 'duplicate')
    } catch (error) {
      failed++
      const message =
        error instanceof RoflParseError
          ? `[${error.code}] ${error.message}`
          : error instanceof Error
            ? error.message
            : 'unknown error'
      console.log(`ERROR ${message}`)
    } finally {
      await source.close?.()
    }
  }

  if (!dryRun) {
    console.log(`\n  ${created} loaded, ${duplicated} duplicate, ${failed} failed\n`)
    console.log('  Now: hook each match to its matchup in /admin/asignar\n')
  }
}

main()
