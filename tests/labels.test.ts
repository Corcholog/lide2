import { describe, expect, it } from 'vitest'
import { buildRoundDateMap, deriveLabels } from '../src/lib/ingest/labels'

/** Rutas reales de la fase de grupos, tal cual las entregaron los equipos. */
const PATHS = [
  '16.05 - FECHA 1 (Replays)/16.05 BLOQUE B/E1vsE4-LEIF8-FECHA1-B.rofl',
  '16.05 - FECHA 1 (Replays)/16.05 BLOQUE A/WINNERS-LEIF8-FECHA1-A.rofl',
  '30.05 - FECHA 2 (Replays)/30.05 - BLOQUE C/E1vsE10-C-LEIF8-FECHA2.rofl',
  '30.05 - FECHA 2 (Replays)/Fecha 3 Equipo1 vs Equipo 2.rofl',
  '13.06 - FECHA 3 (Replays)/13.06 BLOQUE D/LA2-1602356940.rofl',
]

const dates = buildRoundDateMap(PATHS, 2026)

describe('etiquetas derivadas de la ruta', () => {
  it('arma el mapa de ronda a fecha desde los nombres de carpeta', () => {
    expect(dates.get(1)?.toISOString().slice(0, 10)).toBe('2026-05-16')
    expect(dates.get(2)?.toISOString().slice(0, 10)).toBe('2026-05-30')
    expect(dates.get(3)?.toISOString().slice(0, 10)).toBe('2026-06-13')
  })

  it('lee bloque y fecha de la carpeta', () => {
    const labels = deriveLabels(PATHS[0], dates)
    expect(labels.stageLabel).toBe('Bloque B')
    expect(labels.roundLabel).toBe('Fecha 1')
    expect(labels.playedAt?.toISOString().slice(0, 10)).toBe('2026-05-16')
  })

  it('saca el bloque del nombre cuando la carpeta no lo dice', () => {
    expect(deriveLabels('sueltos/WINNERS-B-LEIF8-FECHA1.rofl', dates).stageLabel).toBe('Bloque B')
    expect(deriveLabels('sueltos/E1vsE4-LEIF8-FECHA1-B.rofl', dates).stageLabel).toBe('Bloque B')
  })

  it('al archivo mal guardado le cree al nombre, no a la carpeta', () => {
    // Está dentro de "FECHA 2" pero el nombre dice Fecha 3: la fecha correcta
    // es la de la ronda 3, no la de la carpeta donde quedó.
    const labels = deriveLabels(PATHS[3], dates)
    expect(labels.roundLabel).toBe('Fecha 3')
    expect(labels.playedAt?.toISOString().slice(0, 10)).toBe('2026-06-13')
    expect(labels.stageLabel).toBeNull()
  })

  it('no inventa etiquetas cuando la ruta no dice nada', () => {
    const labels = deriveLabels('replays/LA2-1602356940.rofl', dates)
    expect(labels.roundLabel).toBeNull()
    expect(labels.stageLabel).toBeNull()
    expect(labels.playedAt).toBeNull()
  })
})
