import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  bufferSource,
  matchFingerprint,
  normalizeMatch,
  parseRoflBuffer,
  riotMatchIdFromFileName,
  RoflParseError,
  parseRofl,
  fileSource,
  type RoflSource,
} from '../src/lib/rofl'
import { buildRofl1, buildRofl2, defaultRoster, player, ROFL2_SIGNATURE } from '../src/lib/rofl/synth'

async function expectError(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(RoflParseError)
  await promise.catch((e: RoflParseError) => expect(e.code).toBe(code))
}

describe('parseRofl · formato nuevo (ROFL2)', () => {
  it('lee la metadata del final del archivo', async () => {
    const metadata = await parseRoflBuffer(buildRofl2(defaultRoster()))

    expect(metadata.format).toBe('ROFL2')
    expect(metadata.gameVersion).toBe('15.16.700.4321')
    expect(metadata.gameLengthMs).toBe(1_800_000)
    expect(metadata.players).toHaveLength(10)
  })

  it('sólo lee la cola del archivo, no el payload entero', async () => {
    const file = buildRofl2(defaultRoster(), { payloadSize: 4 * 1024 * 1024 })
    const base = bufferSource(file)
    let bytesRead = 0
    const counting: RoflSource = {
      size: base.size,
      async read(start, length) {
        const buf = await base.read(start, length)
        bytesRead += buf.length
        return buf
      },
    }

    await parseRofl(counting)

    expect(file.length).toBeGreaterThan(4 * 1024 * 1024)
    expect(bytesRead).toBeLessThan(64 * 1024)
  })
})

describe('parseRofl · formato viejo (ROFL)', () => {
  it('usa la tabla de offsets del header', async () => {
    const metadata = await parseRoflBuffer(buildRofl1(defaultRoster()))

    expect(metadata.format).toBe('ROFL')
    expect(metadata.gameVersion).toBe('14.9.500.1234')
    expect(metadata.players).toHaveLength(10)
  })
})

describe('parseRofl · errores', () => {
  it('rechaza un archivo que no es .rofl', async () => {
    await expectError(parseRoflBuffer(Buffer.alloc(1024, 0x50)), 'NOT_A_ROFL')
  })

  it('rechaza un archivo truncado', async () => {
    await expectError(parseRoflBuffer(Buffer.from(ROFL2_SIGNATURE)), 'TRUNCATED_FILE')
  })

  it('explica los replays sin stats (parches 13.20 a 14.10)', async () => {
    await expectError(parseRoflBuffer(buildRofl2([], { statsJson: '[]' })), 'METADATA_EMPTY')
  })

  it('detecta metadata corrupta', async () => {
    const file = buildRofl2(defaultRoster())
    const broken = Buffer.from(file)
    // Rompe el JSON de la metadata sin tocar el largo declarado en el footer.
    broken.write('{{{', file.length - 4 - 10)
    await expectError(parseRoflBuffer(broken), 'MALFORMED_METADATA')
  })

  it('rechaza stats sin PUUID ni campeón', async () => {
    const file = buildRofl2([], { statsJson: JSON.stringify([{ NAME: 'x' }]) })
    await expectError(parseRoflBuffer(file), 'UNSUPPORTED_STATS')
  })
})

describe('normalizeMatch', () => {
  it('mapea los campos principales y detecta al ganador', async () => {
    const metadata = await parseRoflBuffer(buildRofl2(defaultRoster()))
    const match = normalizeMatch(metadata, { fileName: 'LA2-1234567890.rofl' })

    expect(match.patch).toBe('15.16')
    expect(match.winningSide).toBe(100)
    expect(match.riotMatchId).toBe('LA2-1234567890')
    expect(match.players).toHaveLength(10)

    const [first] = match.players
    expect(first.champion).toBe('Ahri')
    expect(first.kills).toBe(3)
    expect(first.win).toBe(true)
    expect(first.raw.PUUID).toBe('puuid-100-0')
  })

  it('coerciona números en notación científica', async () => {
    const roster = defaultRoster()
    roster[0] = player({
      ...roster[0],
      TOTAL_DAMAGE_DEALT_TO_CHAMPIONS: '1.234E+05',
      GOLD_EARNED: '',
    })

    const match = normalizeMatch(await parseRoflBuffer(buildRofl2(roster)))

    expect(match.players[0].damageToChampions).toBe(123_400)
    expect(match.players[0].goldEarned).toBe(0)
  })
})

describe('fingerprint', () => {
  const roster = [
    { puuid: 'a', champion: 'Ahri', kills: 1, deaths: 2, assists: 3 },
    { puuid: 'b', champion: 'Jinx', kills: 4, deaths: 5, assists: 6 },
  ]

  it('no depende del orden de los jugadores', () => {
    expect(matchFingerprint(roster, 1_800_000)).toBe(
      matchFingerprint([...roster].reverse(), 1_800_000),
    )
  })

  it('distingue dos partidas de los mismos jugadores', () => {
    const otherGame = [{ ...roster[0], champion: 'Sett' }, roster[1]]
    expect(matchFingerprint(roster, 1_800_000)).not.toBe(matchFingerprint(otherGame, 1_800_000))
  })

  it('saca el match id del nombre del archivo', () => {
    expect(riotMatchIdFromFileName('LA2-1234567890.rofl')).toBe('LA2-1234567890')
    expect(riotMatchIdFromFileName('EUW1-7654321.rofl')).toBe('EUW1-7654321')
    expect(riotMatchIdFromFileName('final-torneo.rofl')).toBeNull()
  })
})

describe('replay real anonimizado (parche 16.12)', () => {
  const fixtures = [
    { rofl: 'LA2-1602356940', fileName: 'LA2-1602356940.rofl' },
    { rofl: 'E1vsE2-B-LEIF8-FECHA3', fileName: 'E1vsE2-B-LEIF8-FECHA3.rofl' },
  ]

  it.each(fixtures)('$rofl coincide con el snapshot normalizado', async ({ rofl, fileName }) => {
    const source = await fileSource(`fixtures/${rofl}.fixture.rofl`)
    try {
      const match = normalizeMatch(await parseRofl(source), { fileName })
      const expected = JSON.parse(readFileSync(`fixtures/${rofl}.fixture.json`, 'utf8'))

      const { rawMetadata: _meta, players, ...rest } = match
      expect({ ...rest, players: players.map(({ raw: _raw, ...p }) => p) }).toEqual(expected)
    } finally {
      await source.close?.()
    }
  })

  it('lee los 365 campos por jugador y las 5 posiciones', async () => {
    const source = await fileSource('fixtures/LA2-1602356940.fixture.rofl')
    try {
      const match = normalizeMatch(await parseRofl(source))

      expect(match.patch).toBe('16.12')
      expect(match.players).toHaveLength(10)
      expect(Object.keys(match.players[0].raw).length).toBeGreaterThan(300)
      expect(new Set(match.players.map((p) => p.position))).toEqual(
        new Set(['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY']),
      )
      expect(match.players.filter((p) => p.win)).toHaveLength(5)
    } finally {
      await source.close?.()
    }
  })
})
