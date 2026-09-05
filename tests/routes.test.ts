import { describe, expect, it } from 'vitest'
import { matchOrigin, originFrom, teamPath } from '@/lib/routes'

/**
 * The `desde` that the back arrow of a team's page reads.
 *
 * It is the only parameter of the site that comes back out as a destination,
 * so what gets checked here is mostly what it refuses: everything that is not
 * one of the keys has to land on the fallback, and never on a path somebody
 * else wrote.
 */

const MATCH = '3f0c1a5e-8b2d-4c77-9a13-6de0f4a91b22'

describe('where the back arrow goes', () => {
  it('each key resolves to its page', () => {
    expect(originFrom('portada', 'equipos')).toEqual({ href: '/', label: 'Portada' })
    expect(originFrom('grupos', 'equipos')).toEqual({ href: '/#grupos', label: 'Portada' })
    expect(originFrom('tablas', 'equipos')).toEqual({
      href: '/estadisticas/tablas',
      label: 'Tablas',
    })
  })

  it('a match comes back to that match and not to the listing', () => {
    expect(originFrom(matchOrigin(MATCH), 'equipos')).toEqual({
      href: `/partidas/${MATCH}`,
      label: 'Partida',
    })
  })

  it('anything that is not a key falls back', () => {
    for (const value of [
      undefined,
      '',
      'inventado',
      // A repeated parameter arrives as an array.
      ['portada', 'tablas'],
      // The shapes that would turn `desde` into a path written by whoever
      // wrote the link.
      '/admin',
      'https://otro.sitio',
      '//otro.sitio',
      'partida.',
      'partida./admin',
      'partida.no-es-un-uuid',
      `partida.${MATCH}x`,
    ]) {
      expect(originFrom(value, 'equipos')).toEqual({ href: '/equipos', label: 'Equipos' })
    }
  })

  it('the link to a team carries its origin, and without one it is the bare path', () => {
    expect(teamPath('e1')).toBe('/equipos/e1')
    expect(teamPath('e1', 'portada')).toBe('/equipos/e1?desde=portada')
    expect(teamPath('e1', matchOrigin(MATCH))).toBe(`/equipos/e1?desde=partida.${MATCH}`)
  })
})
