import { describe, expect, it } from 'vitest'
import { ordenar, parseOrden } from '../src/lib/tabla/orden'

const COLUMNAS = ['pickrate', 'winrate', 'picks'] as const
const DEFAULT = { id: 'pickrate', dir: 'desc' } as const

describe('parseOrden', () => {
  it('sin parametros devuelve el default', () => {
    expect(parseOrden(undefined, undefined, COLUMNAS, DEFAULT)).toEqual(DEFAULT)
  })

  it('toma la columna y la direccion pedidas', () => {
    expect(parseOrden('winrate', 'asc', COLUMNAS, DEFAULT)).toEqual({ id: 'winrate', dir: 'asc' })
  })

  it('una columna que no existe cae al default', () => {
    expect(parseOrden('inventada', 'asc', COLUMNAS, DEFAULT)).toEqual(DEFAULT)
  })

  it('una direccion inventada conserva la columna y usa la del default', () => {
    expect(parseOrden('picks', 'arriba', COLUMNAS, DEFAULT)).toEqual({ id: 'picks', dir: 'desc' })
  })

  it('con el parametro repetido se queda con el primero', () => {
    expect(parseOrden(['winrate', 'picks'], ['asc'], COLUMNAS, DEFAULT)).toEqual({
      id: 'winrate',
      dir: 'asc',
    })
  })
})

interface Fila {
  nombre: string
  valor: number | null
}

const filas: Fila[] = [
  { nombre: 'Ahri', valor: 3 },
  { nombre: 'Braum', valor: null },
  { nombre: 'Caitlyn', valor: 1 },
  { nombre: 'Darius', valor: 3 },
]

const porNombre = (a: Fila, b: Fila) => a.nombre.localeCompare(b.nombre)

describe('ordenar', () => {
  it('descendente pone el mas grande primero', () => {
    const salida = ordenar(filas, (f) => f.valor, 'desc', porNombre)
    expect(salida.map((f) => f.nombre)).toEqual(['Ahri', 'Darius', 'Caitlyn', 'Braum'])
  })

  it('ascendente pone el mas chico primero', () => {
    const salida = ordenar(filas, (f) => f.valor, 'asc', porNombre)
    expect(salida.map((f) => f.nombre)).toEqual(['Caitlyn', 'Ahri', 'Darius', 'Braum'])
  })

  it('los null van ultimos en las dos direcciones', () => {
    for (const dir of ['asc', 'desc'] as const) {
      const salida = ordenar(filas, (f) => f.valor, dir, porNombre)
      expect(salida.at(-1)?.nombre).toBe('Braum')
    }
  })

  it('el desempate decide entre valores iguales', () => {
    // Ahri y Darius empatan en 3: el desempate alfabetico los ordena.
    const salida = ordenar(filas, (f) => f.valor, 'desc', porNombre)
    expect(salida.slice(0, 2).map((f) => f.nombre)).toEqual(['Ahri', 'Darius'])
  })

  it('el desempate no se invierte con la direccion', () => {
    // Aunque el orden sea ascendente, el empate se resuelve siempre igual: si
    // se diera vuelta, cambiar de direccion movería filas que valen lo mismo.
    const salida = ordenar(filas, (f) => f.valor, 'asc', porNombre)
    expect(salida.slice(1, 3).map((f) => f.nombre)).toEqual(['Ahri', 'Darius'])
  })

  it('ordena texto sin distinguir mayusculas ni acentos', () => {
    const nombres = [{ nombre: 'Zed', valor: 0 }, { nombre: 'ahri', valor: 0 }]
    const salida = ordenar(nombres, (f) => f.nombre, 'asc', porNombre)
    expect(salida.map((f) => f.nombre)).toEqual(['ahri', 'Zed'])
  })

  it('no toca el arreglo original', () => {
    const antes = filas.map((f) => f.nombre)
    ordenar(filas, (f) => f.valor, 'asc', porNombre)
    expect(filas.map((f) => f.nombre)).toEqual(antes)
  })
})
