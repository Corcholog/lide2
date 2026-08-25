/**
 * Prueba aislada del parser de .rofl, sin base de datos ni servidor.
 *
 *   npm run parse:rofl -- fixtures/tu-partida.rofl
 *   npm run parse:rofl -- fixtures/tu-partida.rofl --json > salida.json
 */
import { basename } from 'node:path'
import { fileSource, normalizeMatch, parseRofl, RoflParseError, type RoflSource } from '../src/lib/rofl'

function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function pad(value: string | number, width: number, align: 'left' | 'right' = 'left'): string {
  const s = String(value)
  const clipped = s.length > width ? `${s.slice(0, width - 1)}…` : s
  return align === 'left' ? clipped.padEnd(width) : clipped.padStart(width)
}

/** Envuelve una source contando bytes, para verificar que no bajamos el archivo entero. */
function countingSource(source: RoflSource): RoflSource & { bytesRead: number } {
  const wrapped = {
    size: source.size,
    bytesRead: 0,
    async read(start: number, length: number) {
      const buf = await source.read(start, length)
      wrapped.bytesRead += buf.length
      return buf
    },
    close: source.close?.bind(source),
  }
  return wrapped
}

async function main() {
  const args = process.argv.slice(2)
  const path = args.find((a) => !a.startsWith('--'))
  const asJson = args.includes('--json')
  const showRawKeys = args.includes('--raw')

  if (!path) {
    console.error('Uso: npm run parse:rofl -- <archivo.rofl> [--json] [--raw]')
    process.exit(1)
  }

  const base = await fileSource(path)
  const source = countingSource(base)

  try {
    const metadata = await parseRofl(source)
    const match = normalizeMatch(metadata, { fileName: basename(path) })

    if (asJson) {
      console.log(JSON.stringify(match, null, 2))
      return
    }


    console.log('')
    console.log(`  Archivo    ${path}`)
    console.log(`  Formato    ${match.format}   parche ${match.patch ?? '?'} (${match.gameVersion ?? 'sin versión en el header'})`)
    console.log(`  Duración   ${formatDuration(match.gameLengthMs)}`)
    console.log(`  Match id   ${match.riotMatchId ?? '(no se pudo derivar del nombre del archivo)'}`)
    console.log(`  Ganador    lado ${match.winningSide ?? '?'}${match.endedInSurrender ? ' (rendición)' : ''}`)
    console.log(`  Huella     ${match.fingerprint.slice(0, 16)}…`)
    console.log(`  Leído      ${formatBytes(source.bytesRead)} de ${formatBytes(source.size)}`)
    console.log('')

    for (const side of [100, 200] as const) {
      const team = match.players.filter((p) => p.side === side)
      if (team.length === 0) continue

      const kills = team.reduce((acc, p) => acc + p.kills, 0)
      const gold = team.reduce((acc, p) => acc + p.goldEarned, 0)
      const label = side === 100 ? 'AZUL' : 'ROJO'
      const result = team[0]?.win ? 'VICTORIA' : 'DERROTA'

      console.log(`  ${label}  ${result}   ${kills} kills   ${(gold / 1000).toFixed(1)}k oro`)
      console.log(
        `  ${pad('Jugador', 24)}${pad('Campeón', 14)}${pad('Pos', 8)}${pad('KDA', 10, 'right')}${pad('CS', 6, 'right')}${pad('Oro', 8, 'right')}${pad('Daño', 9, 'right')}${pad('Visión', 8, 'right')}`,
      )

      for (const p of team) {
        const name = p.riotGameName ? `${p.riotGameName}#${p.riotTagLine ?? ''}` : (p.summonerName ?? p.puuid.slice(0, 8))
        console.log(
          `  ${pad(name, 24)}${pad(p.champion, 14)}${pad(p.position ?? '-', 8)}` +
            `${pad(`${p.kills}/${p.deaths}/${p.assists}`, 10, 'right')}` +
            `${pad(p.minionsKilled + p.neutralMinionsKilled, 6, 'right')}` +
            `${pad(p.goldEarned, 8, 'right')}` +
            `${pad(p.damageToChampions, 9, 'right')}` +
            `${pad(p.visionScore, 8, 'right')}`,
        )
      }
      console.log('')
    }

    if (showRawKeys) {
      const keys = Object.keys(match.players[0]?.raw ?? {}).sort()
      console.log(`  ${keys.length} campos en statsJson:`)
      console.log(keys.map((k) => `    ${k}`).join('\n'))
      console.log('')
    }
  } catch (error) {
    if (error instanceof RoflParseError) {
      console.error(`\n  ERROR [${error.code}] ${error.message}\n`)
      if (error.details) console.error('  detalles:', error.details, '\n')
      process.exit(2)
    }
    throw error
  } finally {
    await source.close?.()
  }
}

main()
