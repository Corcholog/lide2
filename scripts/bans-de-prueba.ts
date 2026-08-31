/**
 * Inventa el draft de cada partida, para poder mirar las columnas de bans.
 *
 * El .rofl guarda el scoreboard del final y no el draft, así que `match_bans`
 * sólo se llena a mano desde /admin/bans. Cargar 29 drafts a mano para ver si
 * una tabla se dibuja bien no tiene sentido: esto los inventa.
 *
 *   npm run bans:prueba                  muestra qué haría
 *   npm run bans:prueba -- --cargar      los guarda
 *   npm run bans:prueba -- --cargar --cobertura 0.5   sólo en la mitad
 *   npm run bans:prueba -- --limpiar     los borra
 *
 * SON DATOS FALSOS, igual que los resultados que reparte `datos:prueba`: los
 * replays son de LEIF y estos baneos no los hizo nadie. Sirven para ver que
 * pick rate, ban rate y presencia dan números coherentes entre sí, no para
 * sacar ninguna conclusión.
 *
 * EL SESGO ES A PROPÓSITO. Si los diez campeones salieran de un sorteo parejo,
 * la presencia daría casi lo mismo para todos y la tabla no mostraría nada: en
 * un torneo de verdad se banea lo que se juega. Por eso el sorteo pesa a cada
 * campeón por las veces que se eligió, y así los que encabezan pick rate son
 * más o menos los que encabezan ban rate, que es la forma que tiene la tabla
 * cuando los datos son reales.
 *
 * La semilla es fija: dos corridas dan el mismo draft, así que si algo se ve
 * raro en la tabla se puede volver a la misma foto.
 */

import { createAdminClient } from '../src/lib/supabase/admin'
import { TOURNAMENT } from '../src/lib/lide2/tournament'

const SEMILLA = 20260905
const BANS_POR_LADO = 5

const supabase = createAdminClient()
const args = process.argv.slice(2)
const cargar = args.includes('--cargar')
const limpiar = args.includes('--limpiar')

function flag(name: string): string | null {
  const i = args.indexOf(`--${name}`)
  return i !== -1 && args[i + 1] ? args[i + 1] : null
}

/** Qué porción de las partidas lleva draft. 1 = todas. */
const cobertura = Math.min(Math.max(Number(flag('cobertura') ?? '1'), 0), 1)

/** PRNG con semilla (mulberry32), el mismo que usa datos-de-prueba. */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Saca un campeón del pool, con más chances para los más jugados.
 *
 * El peso es `picks + 1`: el +1 es para que un campeón que se jugó una sola vez
 * igual pueda salir. Sin eso el draft sería siempre el mismo puñado.
 */
function elegirPesado(
  pool: { champion: string; picks: number }[],
  random: () => number,
): string | null {
  const total = pool.reduce((suma, c) => suma + c.picks + 1, 0)
  if (total === 0) return null

  let tirada = random() * total
  for (const candidato of pool) {
    tirada -= candidato.picks + 1
    if (tirada <= 0) return candidato.champion
  }
  return pool[pool.length - 1]?.champion ?? null
}

async function tournamentId(): Promise<string> {
  const { data } = await supabase
    .from('tournaments')
    .select('id')
    .eq('slug', TOURNAMENT.slug)
    .maybeSingle()

  if (!data) throw new Error(`No hay torneo "${TOURNAMENT.slug}". Corré: npm run seed:lide2`)
  return data.id as string
}

async function main() {
  const torneo = await tournamentId()

  const { data: partidasData, error: partidasError } = await supabase
    .from('matches')
    .select('id')
    .eq('tournament_id', torneo)
    .order('played_at')

  if (partidasError) throw new Error(`matches: ${partidasError.message}`)
  const partidas = (partidasData ?? []).map((row) => row.id as string)

  if (partidas.length === 0) {
    console.log('No hay partidas del torneo. Cargalas primero:')
    console.log('  npm run datos:locales -- fixtures')
    console.log('  npm run datos:prueba -- --asignar')
    return
  }

  if (limpiar) {
    const { error } = await supabase.from('match_bans').delete().in('match_id', partidas)
    if (error) throw new Error(`match_bans: ${error.message}`)

    console.log(`Borrados los drafts de ${partidas.length} partidas.`)
    console.log('Las columnas de bans de /estadisticas/tablas vuelven a desaparecer.')
    return
  }

  // El pool sale de lo que se jugó en el torneo: son campeones que existen en
  // este parche y que ya tienen ícono, y sus pesos son los picks de verdad.
  const { data: picksData, error: picksError } = await supabase
    .from('match_players')
    .select('match_id,champion')
    .in('match_id', partidas)

  if (picksError) throw new Error(`match_players: ${picksError.message}`)
  const picks = (picksData ?? []) as { match_id: string; champion: string }[]

  const vecesJugado = new Map<string, number>()
  const jugadosEnPartida = new Map<string, Set<string>>()
  for (const pick of picks) {
    vecesJugado.set(pick.champion, (vecesJugado.get(pick.champion) ?? 0) + 1)
    const enPartida = jugadosEnPartida.get(pick.match_id) ?? new Set<string>()
    enPartida.add(pick.champion)
    jugadosEnPartida.set(pick.match_id, enPartida)
  }

  const pool = [...vecesJugado.entries()]
    .map(([champion, picks]) => ({ champion, picks }))
    .sort((a, b) => b.picks - a.picks || a.champion.localeCompare(b.champion))

  const necesarios = BANS_POR_LADO * 2
  if (pool.length < necesarios + 10) {
    console.log(`Sólo hay ${pool.length} campeones distintos jugados: muy poco para sortear ${necesarios} bans por partida.`)
    return
  }

  const random = rng(SEMILLA)
  const conDraft = partidas.filter(() => random() < cobertura)

  console.log(`\n  ${partidas.length} partidas · ${pool.length} campeones en el pool`)
  console.log(`  ${conDraft.length} van a llevar draft (cobertura ${Math.round(cobertura * 100)}%)\n`)

  let ok = 0
  for (const matchId of conDraft) {
    /*
     * Un campeón que se jugó en esta partida no se pudo banear en esta partida.
     * Es la única regla del draft que no se puede romper sin que los números
     * dejen de cerrar: la presencia contaría al mismo campeón dos veces.
     */
    const prohibidos = jugadosEnPartida.get(matchId) ?? new Set<string>()
    const elegidos: string[] = []
    const disponibles = pool.filter((c) => !prohibidos.has(c.champion))

    while (elegidos.length < necesarios) {
      const restantes = disponibles.filter((c) => !elegidos.includes(c.champion))
      const elegido = elegirPesado(restantes, random)
      if (!elegido) break
      elegidos.push(elegido)
    }

    const bans = elegidos.map((champion, index) => ({
      side: index < BANS_POR_LADO ? 100 : 200,
      order_index: (index % BANS_POR_LADO) + 1,
      champion,
    }))

    if (!cargar) {
      console.log(`    ${matchId.slice(0, 8)}  ${elegidos.join(', ')}`)
      continue
    }

    // Por la misma función que usa el panel: valida los lados, el orden y los
    // repetidos, y adopta la grafía de campeón que ya tiene la base.
    const { data, error } = await supabase.rpc('set_match_bans', {
      p_match_id: matchId,
      p_bans: bans,
      p_created_by: null,
    })

    const result = (data ?? {}) as { ok?: boolean; error?: string; bans?: number }
    const motivo = error?.message ?? (result.ok ? null : (result.error ?? 'rechazado sin motivo'))

    if (motivo) console.error(`  ✗ ${matchId.slice(0, 8)}: ${motivo}`)
    else ok += 1
  }

  if (!cargar) {
    console.log('\n  Para hacerlo: npm run bans:prueba -- --cargar\n')
    return
  }

  console.log(`\n  Drafts cargados en ${ok} de ${conDraft.length} partidas.`)
  console.log('  Mirá /estadisticas/tablas: ya se dibujan Bans, BR y Presencia.')
  console.log('  Para revertir: npm run bans:prueba -- --limpiar\n')
}

main()
