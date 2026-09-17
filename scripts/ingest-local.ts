/**
 * Ingests replays from disk through the same path as the upload screen:
 * signed upload URL -> storage -> range parsing -> RPC. Useful for backfills
 * and for exercising the whole flow without a browser.
 *
 *   npm run ingest -- fixtures --auto
 *   npm run ingest -- fixtures --stage "Bloque B" --round "Fecha 1"
 *   npm run ingest -- "fixtures/13.06 - FECHA 3 (Replays)/13.06 BLOQUE A/LA2-1602349752.rofl"
 *   npm run ingest -- fixtures --dry-run
 */
import { readFileSync, statSync } from 'node:fs'
import { basename } from 'node:path'
import { REPLAYS_BUCKET } from '../src/lib/env'
import { findFileBySha256 } from '../src/lib/ingest/duplicates'
import { buildRoundDateMap, deriveLabels } from '../src/lib/ingest/labels'
import { ingestReplay } from '../src/lib/ingest/ingest'
import { sha256 } from '../src/lib/rofl'
import { getStorage } from '../src/lib/storage'
import { createAdminClient } from '../src/lib/supabase/admin'
import { collectReplays } from './lib/replays'

/**
 * Re-running a backfill with better labels updates what is already stored, so
 * earlier runs do not keep provisional labels.
 */
async function relabel(
  matchId: string,
  labels: { stageLabel: string | null; roundLabel: string | null; playedAt: Date | null },
): Promise<boolean> {
  const patch: Record<string, unknown> = {}
  if (labels.stageLabel) patch.stage_label = labels.stageLabel
  if (labels.roundLabel) patch.round_label = labels.roundLabel
  if (labels.playedAt) patch.played_at = labels.playedAt.toISOString()
  if (Object.keys(patch).length === 0) return false

  const { error } = await createAdminClient().from('matches').update(patch).eq('id', matchId)
  return !error
}

function flag(args: string[], name: string): string | null {
  const index = args.indexOf(`--${name}`)
  return index !== -1 && args[index + 1] ? args[index + 1] : null
}

async function main() {
  const args = process.argv.slice(2)
  const targets = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'))
  const stageLabel = flag(args, 'stage')
  const roundLabel = flag(args, 'round')
  const dryRun = args.includes('--dry-run')
  // Derives block, matchday and day from the path ("16.05 - FECHA 1/16.05 BLOQUE B/...").
  const auto = args.includes('--auto')

  if (targets.length === 0) {
    console.error('Usage: npm run ingest -- <file.rofl | folder> [--stage "Bloque B"] [--round "Fecha 1"] [--dry-run]')
    process.exit(1)
  }

  const files = targets.flatMap(collectReplays)
  if (files.length === 0) {
    console.error('No .rofl files found under those paths.')
    process.exit(1)
  }

  const roundDates = auto ? buildRoundDateMap(files, new Date().getUTCFullYear()) : new Map()

  const labelsFor = (path: string) => {
    const derived = auto ? deriveLabels(path, roundDates) : null
    return {
      stageLabel: stageLabel ?? derived?.stageLabel ?? null,
      roundLabel: roundLabel ?? derived?.roundLabel ?? null,
      playedAt: derived?.playedAt ?? null,
    }
  }

  console.log(`\n  ${files.length} replay(s) to process${dryRun ? ' (dry run)' : ''}\n`)
  if (dryRun) {
    for (const file of files) {
      const labels = labelsFor(file)
      const tags = [
        labels.roundLabel,
        labels.stageLabel,
        labels.playedAt?.toISOString().slice(0, 10),
      ]
        .filter(Boolean)
        .join(' · ')
      console.log(`    ${basename(file).padEnd(42).slice(0, 42)} ${tags || '(no labels)'}`)
    }
    return
  }

  const storage = await getStorage()
  const supabase = createAdminClient()
  let created = 0
  let duplicated = 0
  let failed = 0

  for (const path of files) {
    const name = basename(path)
    process.stdout.write(`    ${name.padEnd(44).slice(0, 44)} `)

    try {
      const buffer = readFileSync(path)
      const hash = sha256(buffer)
      const known = await findFileBySha256(hash)
      if (known) {
        duplicated++
        const updated = await relabel(known.matchId, labelsFor(path))
        console.log(`duplicate${updated ? ' (labels updated)' : ''}`)
        continue
      }

      const target = await storage.createUploadTarget(name)

      const { error: uploadError } = await supabase.storage
        .from(REPLAYS_BUCKET)
        .uploadToSignedUrl(target.path, target.token, new Blob([new Uint8Array(buffer)]))

      if (uploadError) throw new Error(`upload: ${uploadError.message}`)

      const labels = labelsFor(path)
      const result = await ingestReplay({
        storagePath: target.path,
        fileName: name,
        fileSize: buffer.length,
        // The mtime is when the file was copied, not played: only used when the
        // path has no date.
        lastModified: (labels.playedAt ?? statSync(path).mtime).getTime(),
        sha256: hash,
        stageLabel: labels.stageLabel,
        roundLabel: labels.roundLabel,
      })

      if (!result.ok) {
        failed++
        console.log(`ERROR [${result.code}] ${result.message}`)
        continue
      }

      if (result.status === 'duplicate') {
        duplicated++
        await relabel(result.matchId, labels)
        console.log('duplicate (another .rofl of the same match, kept as proof)')
      } else {
        created++
        console.log(`ok  patch ${result.patch ?? '?'}  ${result.players} players`)
      }
    } catch (error) {
      failed++
      console.log(`ERROR ${error instanceof Error ? error.message : error}`)
    }
  }

  console.log(`\n  ${created} new · ${duplicated} duplicate · ${failed} failed\n`)
}

main()
