/**
 * Generates small, anonymized fixtures out of a real .rofl so they can be
 * committed and used by the tests (real replays weigh 10-30 MB and carry the
 * PUUIDs and Riot IDs of real people).
 *
 *   npm run fixture -- fixtures/LA2-1234567890.rofl
 *   npm run fixture -- --demo     (builds a synthetic one, no replay needed)
 */
import { writeFileSync } from 'node:fs'
import { basename } from 'node:path'
import {
  buildRofl1,
  buildRofl2,
  defaultRoster,
  fileSource,
  normalizeMatch,
  parseRofl,
  type RoflPlayerStats,
} from '../src/lib/rofl'

function anonymize(players: RoflPlayerStats[]): RoflPlayerStats[] {
  const seen = { 100: 0, 200: 0 }
  return players.map((raw) => {
    const side = raw.TEAM === '200' ? 200 : 100
    const n = seen[side]++
    return {
      ...raw,
      PUUID: `puuid-${side}-${n}`,
      SUMMONER_ID: '0',
      NAME: `Player${side}${n}`,
      RIOT_ID_GAME_NAME: `Player${side}${n}`,
      RIOT_ID_TAG_LINE: 'LAS',
    }
  })
}

/** A summary without the 365 raw fields per player, so the snapshot stays readable. */
function summarize(match: ReturnType<typeof normalizeMatch>) {
  const { rawMetadata: _rawMetadata, players, ...rest } = match
  return {
    ...rest,
    players: players.map(({ raw: _raw, ...player }) => player),
  }
}

async function main() {
  const args = process.argv.slice(2)
  const demo = args.includes('--demo')
  const path = args.find((a) => !a.startsWith('--'))

  if (demo) {
    const file = buildRofl2(defaultRoster())
    writeFileSync('fixtures/demo.fixture.rofl', file)
    console.log(`fixtures/demo.fixture.rofl (${file.length} bytes) — synthetic test replay`)
    return
  }

  if (!path) {
    console.error('Usage: npm run fixture -- <file.rofl> | --demo')
    process.exit(1)
  }

  const source = await fileSource(path)
  try {
    const metadata = await parseRofl(source)
    const players = anonymize(metadata.players)
    const options = {
      gameLength: metadata.gameLengthMs,
      gameVersion: metadata.gameVersion ?? undefined,
      lastGameChunkId: metadata.lastGameChunkId,
      lastKeyFrameId: metadata.lastKeyFrameId,
      payloadSize: 4096,
    }

    const file = metadata.format === 'ROFL2' ? buildRofl2(players, options) : buildRofl1(players, options)
    const name = basename(path).replace(/\.rofl$/i, '')

    writeFileSync(`fixtures/${name}.fixture.rofl`, file)
    writeFileSync(
      `fixtures/${name}.fixture.json`,
      `${JSON.stringify(
        summarize(normalizeMatch({ ...metadata, players }, { fileName: basename(path) })),
        null,
        2,
      )}\n`,
    )

    console.log(`fixtures/${name}.fixture.rofl  (${(file.length / 1024).toFixed(1)} KB, ${metadata.format})`)
    console.log(`fixtures/${name}.fixture.json  (normalized snapshot)`)
  } finally {
    await source.close?.()
  }
}

main()
