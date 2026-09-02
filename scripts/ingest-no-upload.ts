/**
 * Loads replays from disk WITHOUT uploading them to storage.
 *
 * It is the light-weight sibling of `npm run ingest`: same parser, same
 * payload, same RPC, but without the `uploadToSignedUrl` in the middle. The
 * difference matters when what you want is data to look at the site with and
 * not the file itself: the 30 LEIF replays in `fixtures/` weigh 408 MB, which
 * is nearly half the Supabase free plan's quota, only to have to purge them
 * afterwards.
 *
 *   npm run ingest:no-upload -- fixtures --dry-run    shows what it would do
 *   npm run ingest:no-upload -- fixtures              loads
 *
 * What is lost without the file: the match has no `match_files` row, so
 * `file_count` stays at 0 and there is no .rofl to download from the match page
 * (the link only shows to whoever has a session). Deduplication cannot go by
 * sha256 either, but that is not needed: a match's identity is the
 * `fingerprint` the parser computes, and re-running this over the same folder
 * duplicates nothing.
 *
 * For the real flow - a match day, with the replay kept as proof of the result
 * - there is `npm run ingest`. This script is for test data and nothing else.
 */
import { basename } from 'node:path'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { buildRoundDateMap, deriveLabels } from '../src/lib/ingest/labels'
import { buildIngestPayload } from '../src/lib/ingest/payload'
import { fileSource, normalizeMatch, parseRofl, RoflParseError } from '../src/lib/rofl'
import { createAdminClient } from '../src/lib/supabase/admin'

function collectReplays(target: string): string[] {
  const stats = statSync(target)
  if (!stats.isDirectory()) return target.toLowerCase().endsWith('.rofl') ? [target] : []

  return readdirSync(target)
    .flatMap((entry) => collectReplays(join(target, entry)))
    .filter((path) => !path.includes('.fixture.'))
    .sort()
}

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

  // The labels come from the path ("16.05 - FECHA 1 (Replays)/..."), same as in
  // `npm run ingest -- --auto`. They are not enough to hook the match to its
  // matchup - /admin/asignar or `seed:results` takes care of that - but they
  // leave something readable in the meantime.
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

      console.log(result.status === 'created' ? 'cargada' : 'duplicada')
    } catch (error) {
      failed++
      const message =
        error instanceof RoflParseError
          ? `[${error.code}] ${error.message}`
          : error instanceof Error
            ? error.message
            : 'error desconocido'
      console.log(`ERROR ${message}`)
    } finally {
      await source.close?.()
    }
  }

  if (!dryRun) {
    console.log(`\n  ${created} loaded, ${duplicated} duplicate, ${failed} failed\n`)
    console.log('  Now: npm run seed:results -- --assign\n')
  }
}

main()
