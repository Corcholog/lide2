/**
 * Ingesta replays desde el disco, usando exactamente el mismo camino que la
 * pantalla de subida: signed upload URL -> storage -> parseo por rangos -> RPC.
 *
 * Sirve para backfills (cargar de una todos los .rofl de un torneo ya jugado) y
 * para probar el flujo completo sin browser.
 *
 *   npm run ingest -- fixtures --auto
 *   npm run ingest -- fixtures --stage "Suizo" --round "Ronda 3"
 *   npm run ingest -- "fixtures/13.06 BLOQUE A/LA2-1602349752.rofl"
 *   npm run ingest -- fixtures --dry-run
 */
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { REPLAYS_BUCKET } from '../src/lib/env'
import { findFileBySha256 } from '../src/lib/ingest/duplicates'
import { buildRoundDateMap, deriveLabels } from '../src/lib/ingest/labels'
import { ingestReplay } from '../src/lib/ingest/ingest'
import { getStorage } from '../src/lib/storage'
import { createAdminClient } from '../src/lib/supabase/admin'

function collectReplays(target: string): string[] {
  const stats = statSync(target)
  if (!stats.isDirectory()) return target.toLowerCase().endsWith('.rofl') ? [target] : []

  return readdirSync(target)
    .flatMap((entry) => collectReplays(join(target, entry)))
    .filter((path) => !path.includes('.fixture.'))
    .sort()
}

/**
 * Reprocesar un backfill con mejores etiquetas tiene que corregir lo ya
 * guardado; si no, las primeras corridas quedan con datos provisorios para
 * siempre.
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
  // Deriva bloque, fecha y día de la ruta ("16.05 - FECHA 1/16.05 BLOQUE B/...").
  const auto = args.includes('--auto')

  if (targets.length === 0) {
    console.error('Uso: npm run ingest -- <archivo.rofl | carpeta> [--stage "Suizo"] [--round "Ronda 3"] [--dry-run]')
    process.exit(1)
  }

  const files = targets.flatMap(collectReplays)
  if (files.length === 0) {
    console.error('No se encontraron archivos .rofl en esas rutas.')
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

  console.log(`\n  ${files.length} replay(s) a procesar${dryRun ? ' (dry run)' : ''}\n`)
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
      console.log(`    ${basename(file).padEnd(42).slice(0, 42)} ${tags || '(sin etiquetas)'}`)
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
      const sha256 = createHash('sha256').update(buffer).digest('hex')
      const known = await findFileBySha256(sha256)
      if (known) {
        duplicated++
        const updated = await relabel(known.matchId, labelsFor(path))
        console.log(`duplicada${updated ? ' (etiquetas actualizadas)' : ''}`)
        continue
      }

      const target = await storage.createUploadTarget(name)

      const { error: uploadError } = await supabase.storage
        .from(REPLAYS_BUCKET)
        .uploadToSignedUrl(target.path, target.token, new Blob([new Uint8Array(buffer)]))

      if (uploadError) throw new Error(`subida: ${uploadError.message}`)

      const labels = labelsFor(path)
      const result = await ingestReplay({
        storagePath: target.path,
        fileName: name,
        fileSize: buffer.length,
        // El mtime es cuándo se copió el archivo, no cuándo se jugó: sólo se usa
        // si la ruta no dice nada.
        lastModified: (labels.playedAt ?? statSync(path).mtime).getTime(),
        sha256,
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
        console.log('duplicada (otro .rofl de la misma partida, guardado como prueba)')
      } else {
        created++
        console.log(`ok  parche ${result.patch ?? '?'}  ${result.players} jugadores`)
      }
    } catch (error) {
      failed++
      console.log(`ERROR ${error instanceof Error ? error.message : error}`)
    }
  }

  console.log(`\n  ${created} nuevas · ${duplicated} duplicadas · ${failed} con error\n`)
}

main()
