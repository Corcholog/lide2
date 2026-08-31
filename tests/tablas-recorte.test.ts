import { describe, expect, it } from 'vitest'
import { GRUPOS, metaFilter, parseGrupo } from '../src/lib/stats/tablas'
import { parseEquipo } from '../src/lib/partidas/filtros'
import { conQuery } from '../src/lib/url'
import { GROUPS } from '../src/lib/lide2/tournament'
import type { StatScope } from '../src/lib/stats/types'

const scope = (matchday: number | null): StatScope => ({
  tournamentId: 'torneo-1',
  phase: 'grupos',
  matchday,
})

describe('GRUPOS', () => {
  it('sale del calendario del torneo y no de una lista aparte', () => {
    expect(GRUPOS).toHaveLength(GROUPS.length)
    expect(GRUPOS.map((g) => g.id)).toEqual([...GROUPS])
  })

  it('el label es el mismo texto que guarda teams.group_label', () => {
    expect(GRUPOS[0].label).toBe('Grupo A')
  })
})

describe('parseGrupo', () => {
  it('sin parametro son todos los grupos', () => {
    expect(parseGrupo(undefined)).toBeNull()
    expect(parseGrupo('')).toBeNull()
  })

  it('convierte la letra en la etiqueta que usa la base', () => {
    expect(parseGrupo('B')).toBe('Grupo B')
  })

  it('acepta la letra en minuscula', () => {
    expect(parseGrupo('c')).toBe('Grupo C')
  })

  it('un grupo que no existe son todos', () => {
    expect(parseGrupo('Z')).toBeNull()
  })

  it('con el parametro repetido se queda con el primero', () => {
    expect(parseGrupo(['D', 'A'])).toBe('Grupo D')
  })
})

describe('metaFilter', () => {
  it('acumulado: todos los grupos y toda la fase', () => {
    expect(metaFilter(scope(null), null)).toEqual({
      tournament_id: 'torneo-1',
      phase: 'grupos',
      all_groups: true,
      all_matchdays: true,
    })
  })

  it('por fecha: todos los grupos, una fecha', () => {
    expect(metaFilter(scope(2), null)).toEqual({
      tournament_id: 'torneo-1',
      phase: 'grupos',
      all_groups: true,
      all_matchdays: false,
      matchday: 2,
    })
  })

  it('por grupo: un grupo, toda la fase', () => {
    expect(metaFilter(scope(null), 'Grupo B')).toEqual({
      tournament_id: 'torneo-1',
      phase: 'grupos',
      all_groups: false,
      group_label: 'Grupo B',
      all_matchdays: true,
    })
  })

  it('grupo mas fecha: el cruce de los dos', () => {
    expect(metaFilter(scope(3), 'Grupo A')).toEqual({
      tournament_id: 'torneo-1',
      phase: 'grupos',
      all_groups: false,
      group_label: 'Grupo A',
      all_matchdays: false,
      matchday: 3,
    })
  })

  it('nunca manda group_label ni matchday cuando el recorte es total', () => {
    // Mandarlos en null traeria tambien las partidas sin grupo resuelto, que es
    // exactamente lo que las dos banderas evitan.
    const filtro = metaFilter(scope(null), null)
    expect(filtro).not.toHaveProperty('group_label')
    expect(filtro).not.toHaveProperty('matchday')
  })
})

describe('parseEquipo', () => {
  const equipos = ['aaa', 'bbb']

  it('sin parametro no filtra', () => {
    expect(parseEquipo(undefined, equipos)).toBeNull()
  })

  it('acepta un equipo del torneo', () => {
    expect(parseEquipo('bbb', equipos)).toBe('bbb')
  })

  it('ignora un id que no es de este torneo', () => {
    expect(parseEquipo('zzz', equipos)).toBeNull()
  })

  it('con el parametro repetido se queda con el primero', () => {
    expect(parseEquipo(['aaa', 'bbb'], equipos)).toBe('aaa')
  })
})

describe('conQuery', () => {
  it('sin parametros devuelve la ruta pelada', () => {
    expect(conQuery('/partidas', {})).toBe('/partidas')
  })

  it('conserva los filtros que ya estaban puestos', () => {
    expect(conQuery('/partidas', { fecha: 2, equipo: 'aaa' })).toBe('/partidas?fecha=2&equipo=aaa')
  })

  it('tira lo vacio en vez de dejar un parametro sin valor', () => {
    expect(conQuery('/partidas', { fecha: null, equipo: undefined, orden: '' })).toBe('/partidas')
  })
})
