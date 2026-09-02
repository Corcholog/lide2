import { describe, expect, it } from 'vitest'
import { buildRoundDateMap, deriveLabels } from '../src/lib/ingest/labels'

/** Real group-phase paths, exactly as the teams handed them over. */
const PATHS = [
  '16.05 - FECHA 1 (Replays)/16.05 BLOQUE B/E1vsE4-LEIF8-FECHA1-B.rofl',
  '16.05 - FECHA 1 (Replays)/16.05 BLOQUE A/WINNERS-LEIF8-FECHA1-A.rofl',
  '30.05 - FECHA 2 (Replays)/30.05 - BLOQUE C/E1vsE10-C-LEIF8-FECHA2.rofl',
  '30.05 - FECHA 2 (Replays)/Fecha 3 Equipo1 vs Equipo 2.rofl',
  '13.06 - FECHA 3 (Replays)/13.06 BLOQUE D/LA2-1602356940.rofl',
]

const dates = buildRoundDateMap(PATHS, 2026)

describe('labels derived from the path', () => {
  it('builds the round-to-date map from the folder names', () => {
    expect(dates.get(1)?.toISOString().slice(0, 10)).toBe('2026-05-16')
    expect(dates.get(2)?.toISOString().slice(0, 10)).toBe('2026-05-30')
    expect(dates.get(3)?.toISOString().slice(0, 10)).toBe('2026-06-13')
  })

  it('reads block and matchday off the folder', () => {
    const labels = deriveLabels(PATHS[0], dates)
    expect(labels.stageLabel).toBe('Bloque B')
    expect(labels.roundLabel).toBe('Fecha 1')
    expect(labels.playedAt?.toISOString().slice(0, 10)).toBe('2026-05-16')
  })

  it('takes the block from the name when the folder does not say', () => {
    expect(deriveLabels('sueltos/WINNERS-B-LEIF8-FECHA1.rofl', dates).stageLabel).toBe('Bloque B')
    expect(deriveLabels('sueltos/E1vsE4-LEIF8-FECHA1-B.rofl', dates).stageLabel).toBe('Bloque B')
  })

  it('for a misfiled file it believes the name, not the folder', () => {
    // It sits inside "FECHA 2" but the name says Fecha 3: the right date is
    // round 3's, not that of the folder it ended up in.
    const labels = deriveLabels(PATHS[3], dates)
    expect(labels.roundLabel).toBe('Fecha 3')
    expect(labels.playedAt?.toISOString().slice(0, 10)).toBe('2026-06-13')
    expect(labels.stageLabel).toBeNull()
  })

  it('does not invent labels when the path says nothing', () => {
    const labels = deriveLabels('replays/LA2-1602356940.rofl', dates)
    expect(labels.roundLabel).toBeNull()
    expect(labels.stageLabel).toBeNull()
    expect(labels.playedAt).toBeNull()
  })
})
