import { describe, expect, it } from 'vitest'
import { championIndex, resolveChampion } from '../src/lib/champions/catalogo'
import { championKey, roflKey } from '../src/lib/ddragon'

/** Un recorte del catalogo de ddragon, con los nombres que mas se escriben mal. */
const CATALOGO = [
  { key: 'MonkeyKing', name: 'Wukong' },
  { key: 'Kaisa', name: "Kai'Sa" },
  { key: 'DrMundo', name: 'Dr. Mundo' },
  { key: 'Chogath', name: "Cho'Gath" },
  { key: 'Fiddlesticks', name: 'Fiddlesticks' },
  { key: 'Nunu', name: 'Nunu y Willump' },
  { key: 'Ahri', name: 'Ahri' },
]

const index = championIndex(CATALOGO)

describe('resolveChampion', () => {
  it('encuentra por el nombre que se ve', () => {
    expect(resolveChampion(index, 'Wukong')).toBe('MonkeyKing')
  })

  it('encuentra por la clave interna, que es lo que guarda el .rofl', () => {
    expect(resolveChampion(index, 'MonkeyKing')).toBe('MonkeyKing')
  })

  it('no distingue mayusculas', () => {
    expect(resolveChampion(index, 'wukong')).toBe('MonkeyKing')
    expect(resolveChampion(index, 'AHRI')).toBe('Ahri')
  })

  it('ignora apostrofes, puntos y espacios', () => {
    expect(resolveChampion(index, "Kai'Sa")).toBe('Kaisa')
    expect(resolveChampion(index, 'kaisa')).toBe('Kaisa')
    expect(resolveChampion(index, 'KAI SA')).toBe('Kaisa')
    expect(resolveChampion(index, 'Dr. Mundo')).toBe('DrMundo')
    expect(resolveChampion(index, 'drmundo')).toBe('DrMundo')
    expect(resolveChampion(index, "cho'gath")).toBe('Chogath')
    expect(resolveChampion(index, 'Nunu y Willump')).toBe('Nunu')
  })

  it('ignora los acentos que alguien pueda escribir de mas', () => {
    expect(resolveChampion(index, 'Áhri')).toBe('Ahri')
  })

  it('recorta los espacios de los costados', () => {
    expect(resolveChampion(index, '  Ahri  ')).toBe('Ahri')
  })

  it('devuelve null con un campeon que no existe', () => {
    expect(resolveChampion(index, 'Chamuyo')).toBeNull()
  })

  it('devuelve null con el campo vacio', () => {
    expect(resolveChampion(index, '')).toBeNull()
    expect(resolveChampion(index, '   ')).toBeNull()
  })
})

describe('roflKey', () => {
  it('vuelve a la grafia del .rofl', () => {
    expect(roflKey('Fiddlesticks')).toBe('FiddleSticks')
  })

  it('deja igual a los que no son excepcion', () => {
    expect(roflKey('MonkeyKing')).toBe('MonkeyKing')
  })

  it('es el inverso de championKey', () => {
    // Las dos puntas tienen que cerrar: si no, un ban guardado no coincide con
    // el pick del mismo campeon y el meta lo cuenta dos veces.
    expect(championKey(roflKey('Fiddlesticks'))).toBe('Fiddlesticks')
  })
})
