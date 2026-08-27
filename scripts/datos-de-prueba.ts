/**
 * Reparte las partidas ya subidas entre los cruces de la LIDE 2, al azar.
 *
 * Sirve para ver el sitio lleno antes del 5 de septiembre: las estadísticas,
 * la tabla y sobre todo las cards de /admin/cards no se pueden revisar contra
 * una base vacía. Los replays son de LEIF, otro torneo, así que los resultados
 * no significan nada: lo que se está probando es el pipeline y el diseño.
 *
 *   npm run ingest -- fixtures --auto        primero, sube y parsea los .rofl
 *   npm run datos:prueba                     muestra qué haría
 *   npm run datos:prueba -- --asignar        reparte
 *   npm run datos:prueba -- --limpiar        desasigna todo
 *
 * OJO: el sitio es público. Mientras estén asignadas, cualquiera que entre ve
 * esos resultados como si fueran de la LIDE 2. `--limpiar` los desengancha (los
 * .rofl siguen subidos; para borrarlos está scripts/purge-leif.ts).
 *
 * El reparto usa una semilla fija, así que dos corridas dan el mismo resultado:
 * si algo se ve raro en una card, se puede volver a la misma foto.
 */

import { TOURNAMENT } from '../src/lib/lide2/tournament'
import { createAdminClient } from '../src/lib/supabase/admin'

const SEMILLA = 20260905

const supabase = createAdminClient()
const args = process.argv.slice(2)
const asignar = args.includes('--asignar')
const limpiar = args.includes('--limpiar')

/** PRNG con semilla (mulberry32): el mismo reparto en cada corrida. */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
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

  if (limpiar) {
    /*
     * Desasignar no alcanza para dejar la base como estaba.
     *
     * `unassign_match` suelta el cruce y borra las etiquetas, pero no toca
     * `matches.tournament_id`, así que las partidas quedan figurando como de la
     * LIDE 2: siguen saliendo en /partidas, que no filtra por torneo, y
     * `purge-leif` —que busca justamente las que NO son de la LIDE 2— no las
     * encuentra para borrarlas. Quedan en tierra de nadie.
     *
     * Tampoco deshace los `team_members` que dio de alta la asignación, que son
     * el "roster detectado" que se ve en la ficha de cada equipo.
     */
    const [{ data: porCruce }, { data: porTorneo }] = await Promise.all([
      supabase.from('fixtures').select('match_id').eq('tournament_id', torneo).not('match_id', 'is', null),
      supabase.from('matches').select('id').eq('tournament_id', torneo),
    ])

    const matches = [
      ...new Set([
        ...(porCruce ?? []).map((row) => row.match_id as string),
        ...(porTorneo ?? []).map((row) => row.id as string),
      ]),
    ]

    if (matches.length === 0) {
      console.log('No hay nada de prueba en la base.')
      return
    }

    const { data: apariciones } = await supabase
      .from('match_players')
      .select('player_id')
      .in('match_id', matches)
      .not('player_id', 'is', null)

    const jugadores = [...new Set((apariciones ?? []).map((row) => row.player_id as string))]

    // Primero los planteles: `unassign_match` vuelve a deducir los lados a
    // partir de team_members, así que si se borran después, los equipos se
    // quedan pegados a la partida.
    if (jugadores.length > 0) {
      const { error } = await supabase.from('team_members').delete().in('player_id', jugadores)
      if (error) throw new Error(`team_members: ${error.message}`)
    }

    for (const matchId of matches) {
      const { error } = await supabase.rpc('unassign_match', { p_match_id: matchId })
      if (error) throw new Error(`unassign_match(${matchId}): ${error.message}`)
    }

    const { error } = await supabase
      .from('matches')
      .update({ tournament_id: null })
      .in('id', matches)
    if (error) throw new Error(`matches: ${error.message}`)

    console.log(`Desenganchadas ${matches.length} partidas y ${jugadores.length} jugadores.`)
    console.log('La tabla, el fixture y las estadísticas vuelven a cero.')
    console.log('\nLas partidas siguen cargadas y se ven en /partidas. Para borrarlas del todo:')
    console.log('  npx tsx --env-file=.env.local scripts/purge-leif.ts --confirmar')
    return
  }

  const [{ data: libres }, { data: cruces }] = await Promise.all([
    supabase.from('unassigned_matches').select('match_id,played_at,riot_match_id'),
    supabase
      .from('fixtures')
      .select('id,matchday,slot,group_label,team_a_id,team_b_id')
      .eq('tournament_id', torneo)
      .is('match_id', null)
      .order('matchday')
      .order('slot')
      .order('group_label'),
  ])

  const partidas = libres ?? []
  const disponibles = cruces ?? []

  if (partidas.length === 0) {
    console.log('No hay partidas sin asignar. Subilas primero:')
    console.log('  npm run ingest -- fixtures --auto')
    return
  }

  // Se mezclan las partidas y no los cruces: así los cruces se llenan en orden
  // de fecha, y las fechas 1 y 2 quedan completas antes de que empiece la 3.
  // Un torneo a medio jugar se parece más a lo que se va a ver de verdad que
  // uno con partidos sueltos repartidos por todos lados.
  const mezcladas = shuffle(partidas, rng(SEMILLA))
  const pares = disponibles.slice(0, mezcladas.length).map((cruce, index) => ({
    cruce,
    match: mezcladas[index],
  }))

  console.log(`${partidas.length} partidas sin asignar · ${disponibles.length} cruces libres`)
  console.log(`Se van a asignar ${pares.length}.`)

  if (!asignar) {
    for (const { cruce, match } of pares.slice(0, 10)) {
      console.log(
        `  fecha ${cruce.matchday} turno ${cruce.slot} ${cruce.group_label} ← ${match.riot_match_id ?? match.match_id}`,
      )
    }
    if (pares.length > 10) console.log(`  … y ${pares.length - 10} más`)
    console.log('\nPara hacerlo: npm run datos:prueba -- --asignar')
    return
  }

  let ok = 0
  for (const { cruce, match } of pares) {
    /*
     * El lado azul va explícito, siempre el equipo A.
     *
     * La función lo puede deducir sola sólo si algún jugador de la partida ya
     * está en un equipo, y en la primera asignación no lo está ninguno: no hay
     * nada de dónde deducirlo, así que devuelve error en vez de inventar. Con
     * datos de prueba da igual cuál lado es cuál, lo que importa es que el
     * cruce quede jugado.
     */
    const { data, error } = await supabase.rpc('assign_match_to_fixture', {
      p_match_id: match.match_id,
      p_fixture_id: cruce.id,
      p_blue_team_id: cruce.team_a_id,
    })

    // La función devuelve { ok, error } y no lanza: un rechazo suyo llega con
    // `error` en null. Sin mirar el payload, esto contaría como éxito una
    // corrida en la que no se asignó absolutamente nada.
    const result = (data ?? {}) as { ok?: boolean; error?: string }
    const motivo = error?.message ?? (result.ok ? null : (result.error ?? 'rechazada sin motivo'))

    if (motivo) console.error(`  ✗ fecha ${cruce.matchday} ${cruce.group_label}: ${motivo}`)
    else ok += 1
  }

  console.log(`\nAsignadas ${ok} de ${pares.length}.`)
  if (ok === 0) {
    console.error('No se asignó ninguna. La base quedó como estaba.')
    process.exit(1)
  }
  console.log('Mirá /admin/cards?fecha=1 y la home. Para revertir: npm run datos:prueba -- --limpiar')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
