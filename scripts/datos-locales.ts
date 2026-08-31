/**
 * Carga replays desde el disco SIN subirlos al storage.
 *
 * Es el hermano liviano de `npm run ingest`: mismo parser, mismo payload, misma
 * RPC, pero sin el `uploadToSignedUrl` del medio. La diferencia importa cuando
 * lo que se quiere son datos para mirar el sitio y no el archivo en sí: los 30
 * replays de LEIF que hay en `fixtures/` pesan 408 MB, o sea casi media cuota
 * del plan free de Supabase, para después tener que purgarlos.
 *
 *   npm run datos:locales -- fixtures --dry-run    muestra qué haría
 *   npm run datos:locales -- fixtures              carga
 *
 * Lo que se pierde sin el archivo: la partida no tiene fila en `match_files`,
 * así que `file_count` queda en 0 y no hay .rofl para descargar desde la ficha
 * (el link sólo se le muestra a quien tiene sesión). El dedupe tampoco puede
 * ser por sha256, pero eso no hace falta: la identidad de una partida es el
 * `fingerprint` que calcula el parser, y volver a correr esto sobre la misma
 * carpeta devuelve "duplicada" en vez de cargar dos veces.
 *
 * Para el flujo de verdad —el de un día de partido, con el replay guardado como
 * prueba del resultado— está `npm run ingest`. Este script es para datos de
 * prueba y nada más.
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
    console.error('Uso: npm run datos:locales -- <archivo.rofl | carpeta> [--dry-run]')
    process.exit(1)
  }

  const files = targets.flatMap(collectReplays)
  if (files.length === 0) {
    console.error('No se encontraron archivos .rofl en esas rutas.')
    process.exit(1)
  }

  // Las etiquetas salen de la ruta ("16.05 - FECHA 1 (Replays)/..."), igual que
  // en `npm run ingest -- --auto`. No alcanzan para enganchar la partida a su
  // cruce —de eso se encarga /admin/asignar o `datos:prueba`— pero dejan algo
  // legible mientras tanto.
  const roundDates = buildRoundDateMap(files, new Date().getUTCFullYear())

  console.log(`\n  ${files.length} replay(s)${dryRun ? ' (dry run)' : ''}, sin subir al storage\n`)

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
        console.log(`${match.players.length} jugadores   ${tags || '(sin etiquetas)'}`)
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
    console.log(`\n  ${created} cargadas, ${duplicated} duplicadas, ${failed} con error\n`)
    console.log('  Ahora: npm run datos:prueba -- --asignar\n')
  }
}

main()
