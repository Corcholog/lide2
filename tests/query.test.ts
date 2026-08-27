import { describe, expect, it } from 'vitest'
import { maybeRow, rows } from '@/lib/supabase/query'
import type { PostgrestError } from '@supabase/supabase-js'

/**
 * Que un error de consulta no se disfrace de "todavía no hay nada".
 *
 * Es la diferencia que importa un día de partido: sin esto, una policy rota y
 * una fecha sin jugar se ven exactamente igual en la pantalla.
 */

const falla: PostgrestError = Object.assign(new Error('permission denied for table matches'), {
  code: '42501',
  details: '',
  hint: '',
  name: 'PostgrestError',
  toJSON: () => ({}),
}) as unknown as PostgrestError

describe('leer una consulta', () => {
  it('vacío es un resultado válido', () => {
    expect(rows({ data: [], error: null }, 'las partidas')).toEqual([])
  })

  it('null sin error también: PostgREST a veces no manda array', () => {
    expect(rows({ data: null, error: null }, 'las partidas')).toEqual([])
  })

  it('devuelve las filas cuando hay', () => {
    expect(rows({ data: [{ id: 1 }], error: null }, 'las partidas')).toEqual([{ id: 1 }])
  })

  it('un error explota en vez de devolver vacío', () => {
    expect(() => rows({ data: null, error: falla }, 'las partidas')).toThrow(
      /No se pudo leer las partidas/,
    )
  })

  it('el mensaje lleva el código, que es lo que se busca en los logs', () => {
    expect(() => rows({ data: null, error: falla }, 'las partidas')).toThrow(/42501/)
  })

  it('y conserva el error original como causa', () => {
    try {
      rows({ data: null, error: falla }, 'las partidas')
      expect.unreachable()
    } catch (error) {
      expect((error as Error).cause).toBe(falla)
    }
  })

  it('explota aunque haya llegado data: si hubo error, los datos no son confiables', () => {
    expect(() => rows({ data: [{ id: 1 }], error: falla }, 'las partidas')).toThrow()
  })
})

describe('leer una fila que puede no existir', () => {
  it('null es "no está", y eso no es un error', () => {
    expect(maybeRow({ data: null, error: null }, 'el equipo')).toBeNull()
  })

  it('pero "no se pudo preguntar" sí lo es', () => {
    expect(() => maybeRow({ data: null, error: falla }, 'el equipo')).toThrow(
      /No se pudo leer el equipo/,
    )
  })
})
