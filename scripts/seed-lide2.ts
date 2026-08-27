/**
 * Carga la estructura de la LIDE 2 en la base: torneo, universidades, los 20
 * equipos con su grupo, el fixture completo de la fase de grupos y el bracket de
 * playoffs encadenado.
 *
 * Todo sale de src/lib/lide2/tournament.ts, que transcribe las planillas de la
 * organizacion. Ya no hay nada inventado: los equipos son los de verdad y los
 * cruces son los publicados.
 *
 *   npm run seed:lide2                     estructura y fixture
 *   npm run seed:lide2 -- --clasificados   mete a los dos primeros de cada
 *                                          grupo en los cuartos (correr cuando
 *                                          termine la fase de grupos)
 *   npm run seed:lide2 -- --limpiar        deja la base como estaba
 */
import { ROSTERS } from '../src/lib/lide2/rosters'
import {
  CALENDAR,
  GROUPS,
  SCHEDULE,
  TEAMS,
  TOURNAMENT,
  UNIVERSITIES,
  teamByNumber,
} from '../src/lib/lide2/tournament'
import { createAdminClient } from '../src/lib/supabase/admin'

const SLUG = 'lide-2'

function milestone(id: string): string | null {
  return CALENDAR.find((entry) => entry.id === id)?.date ?? null
}

const supabase = createAdminClient()

async function findTournament(): Promise<string | null> {
  const { data } = await supabase.from('tournaments').select('id').eq('slug', SLUG).maybeSingle()
  return (data?.id as string) ?? null
}

/** Crea el torneo, las 13 universidades, las etapas y las 7 series del bracket. */
async function createStructure(): Promise<string> {
  const { data: tournament, error } = await supabase
    .from('tournaments')
    .upsert(
      {
        name: TOURNAMENT.name,
        slug: SLUG,
        format: 'grupos + playoffs',
        starts_at: milestone('fecha-1')?.slice(0, 10),
        ends_at: milestone('final')?.slice(0, 10),
      },
      { onConflict: 'slug' },
    )
    .select('id')
    .single()

  if (error) throw new Error(`torneo: ${error.message}`)
  const tournamentId = tournament.id as string

  // El indice unico es sobre lower(tag), una expresion, y upsert no puede
  // apuntarle: on conflict solo matchea indices por columna. Se resuelve
  // leyendo primero, igual que con los equipos.
  const { data: existing } = await supabase.from('universities').select('id,tag')
  const universityId = new Map(
    (existing ?? []).map((row) => [String(row.tag).toLowerCase(), row.id as string]),
  )

  const missing = Object.values(UNIVERSITIES).filter(
    (university) => !universityId.has(university.tag.toLowerCase()),
  )

  if (missing.length > 0) {
    const { data: created, error: uniError } = await supabase
      .from('universities')
      .insert(missing.map((university) => ({ name: university.name, tag: university.tag })))
      .select('id,tag')

    if (uniError) throw new Error(`universidades: ${uniError.message}`)
    for (const row of created ?? []) {
      universityId.set(String(row.tag).toLowerCase(), row.id as string)
    }
  }

  // Etapas: una por grupo (para el calendario y el panel) y una por ronda de
  // playoffs (las series cuelgan de estas).
  const stages = [
    ...GROUPS.map((name, index) => ({
      tournament_id: tournamentId,
      name: `Grupo ${name}`,
      kind: 'group',
      order_index: index + 1,
    })),
    { tournament_id: tournamentId, name: 'Cuartos de final', kind: 'bracket', order_index: 5 },
    { tournament_id: tournamentId, name: 'Semifinales', kind: 'bracket', order_index: 6 },
    { tournament_id: tournamentId, name: 'Gran final', kind: 'bracket', order_index: 7 },
  ]

  // Las etapas no se recrean si ya estan: borrarlas cascadea a las series, y eso
  // desvincularia las partidas de playoffs ya subidas.
  const { data: alreadyThere } = await supabase
    .from('stages')
    .select('id,name')
    .eq('tournament_id', tournamentId)

  if (!alreadyThere || alreadyThere.length === 0) {
    const { data: created, error: stageError } = await supabase
      .from('stages')
      .insert(stages)
      .select('id,name')

    if (stageError) throw new Error(`etapas: ${stageError.message}`)
    await createBracket(new Map((created ?? []).map((row) => [row.name as string, row.id as string])))
  } else {
    console.log('  Las etapas y el bracket ya existian: no se tocaron.')
  }

  const teamId = await createTeams(tournamentId, universityId)
  await createFixtures(tournamentId, teamId)

  return tournamentId
}

/**
 * El bracket se crea de atras para adelante: la final primero, porque las
 * semis la referencian, y los cuartos referencian a las semis. Cada serie sabe
 * a que serie y a que lado manda a su ganador, y eso es lo que hace que
 * advance_series() lo mueva solo cuando se sube el ultimo .rofl.
 *
 * Cruces: los dos equipos de un mismo grupo no se pueden ver hasta la final.
 */
async function createBracket(stageId: Map<string, string>): Promise<void> {
  const { data: final, error: finalError } = await supabase
    .from('series')
    .insert({
      stage_id: stageId.get('Gran final'),
      round: 'Gran final',
      best_of: 5,
      order_index: 1,
      slot_a_label: 'Ganador semifinal 1',
      slot_b_label: 'Ganador semifinal 2',
      scheduled_at: milestone('final'),
    })
    .select('id')
    .single()

  if (finalError) throw new Error(`final: ${finalError.message}`)

  const { data: semis, error: semiError } = await supabase
    .from('series')
    .insert(
      [1, 2].map((index) => ({
        stage_id: stageId.get('Semifinales'),
        round: 'Semifinales',
        best_of: 3,
        order_index: index,
        slot_a_label: `Ganador cuartos ${index * 2 - 1}`,
        slot_b_label: `Ganador cuartos ${index * 2}`,
        scheduled_at: milestone('semis'),
        next_series_id: final.id,
        next_slot: index === 1 ? 'a' : 'b',
      })),
    )
    .select('id,order_index')

  if (semiError) throw new Error(`semis: ${semiError.message}`)
  const semiId = new Map((semis ?? []).map((row) => [row.order_index as number, row.id as string]))

  const quarters = [
    { order: 1, a: '1º A', b: '2º B', semi: 1, slot: 'a' },
    { order: 2, a: '1º C', b: '2º D', semi: 1, slot: 'b' },
    { order: 3, a: '1º B', b: '2º A', semi: 2, slot: 'a' },
    { order: 4, a: '1º D', b: '2º C', semi: 2, slot: 'b' },
  ]

  const { error: quarterError } = await supabase.from('series').insert(
    quarters.map((quarter) => ({
      stage_id: stageId.get('Cuartos de final'),
      round: 'Cuartos de final',
      best_of: 3,
      order_index: quarter.order,
      slot_a_label: quarter.a,
      slot_b_label: quarter.b,
      scheduled_at: milestone('cuartos'),
      next_series_id: semiId.get(quarter.semi),
      next_slot: quarter.slot,
    })),
  )

  if (quarterError) throw new Error(`cuartos: ${quarterError.message}`)
}

/**
 * Crea o actualiza los 20 equipos y sus universidades.
 *
 * `seed` guarda el numero oficial (1 a 20), que es como los nombra la
 * organizacion en el fixture, y `tag` el codigo de inscripcion cuando lo tienen.
 * Los cuatro equipos armados con inscripciones individuales representan a mas de
 * una universidad: university_id se queda con la mas representada, para poder
 * atribuir en las estadisticas, y la lista completa va a team_universities.
 *
 * Devuelve el id de cada equipo por numero, que es lo que necesita el fixture.
 */
async function createTeams(
  tournamentId: string,
  universityId: Map<string, string>,
): Promise<Map<number, string>> {
  const byNumber = new Map<number, string>()

  for (const team of TEAMS) {
    const row = {
      tournament_id: tournamentId,
      name: team.name,
      tag: team.code,
      seed: team.number,
      group_label: `Grupo ${team.group}`,
      university_id: universityId.get(UNIVERSITIES[team.universities[0]].tag.toLowerCase()) ?? null,
    }

    // El indice unico es (tournament_id, lower(name)), una expresion, asi que
    // upsert no puede apuntarle: se lee primero. De paso, volver a correr esto
    // no pisa el logo que alguien haya cargado desde el panel.
    const { data: existing } = await supabase
      .from('teams')
      .select('id')
      .eq('tournament_id', tournamentId)
      .ilike('name', team.name)
      .maybeSingle()

    let id: string
    if (existing) {
      id = existing.id as string
      const { error } = await supabase.from('teams').update(row).eq('id', id)
      if (error) throw new Error(`${team.name}: ${error.message}`)
    } else {
      const { data: created, error } = await supabase.from('teams').insert(row).select('id').single()
      if (error) throw new Error(`${team.name}: ${error.message}`)
      id = created.id as string
    }

    byNumber.set(team.number, id)

    // Se reemplaza entera: si un equipo cambia de composicion, la lista vieja no
    // tiene por que sobrevivir.
    await supabase.from('team_universities').delete().eq('team_id', id)

    const links = team.universities
      .map((tag, index) => ({
        team_id: id,
        university_id: universityId.get(UNIVERSITIES[tag].tag.toLowerCase()),
        order_index: index,
      }))
      .filter((link) => link.university_id)

    if (links.length > 0) {
      const { error } = await supabase.from('team_universities').insert(links)
      if (error) throw new Error(`universidades de ${team.name}: ${error.message}`)
    }

    await upsertRoster(id, team.number, universityId)
  }

  return byNumber
}

/**
 * Escribe el plantel inscripto de un equipo.
 *
 * Va por upsert contra (team_id, order_index) y no por borrar e insertar: si un
 * administrador ya emparejo a alguien con su cuenta de Riot, ese player_id no
 * esta en el payload y sobrevive. Lo mismo con display_name, si le dejo el
 * nombre prolijo.
 */
async function upsertRoster(
  teamId: string,
  number: number,
  universityId: Map<string, string>,
): Promise<void> {
  const entries = ROSTERS[number] ?? []
  if (entries.length === 0) return

  const rows = entries.map((entry, index) => ({
    team_id: teamId,
    full_name: entry.name,
    university_id: universityId.get(UNIVERSITIES[entry.university].tag.toLowerCase()) ?? null,
    order_index: index,
  }))

  const { error } = await supabase
    .from('team_roster')
    .upsert(rows, { onConflict: 'team_id,order_index' })

  if (error) throw new Error(`plantel del equipo ${number}: ${error.message}`)
}

/**
 * Escribe los 40 cruces de la fase de grupos.
 *
 * Un cruce existe desde que la organizacion publica el calendario, mucho antes
 * de que haya un .rofl, asi que va en `fixtures` y no en `matches`. Cuando
 * alguien suba el replay se le engancha la partida y la vista fixture_results
 * empieza a mostrar el resultado.
 */
async function createFixtures(
  tournamentId: string,
  teamId: Map<number, string>,
): Promise<void> {
  const { data: stages } = await supabase
    .from('stages')
    .select('id,name')
    .eq('tournament_id', tournamentId)

  const stageId = new Map((stages ?? []).map((row) => [row.name as string, row.id as string]))

  const rows = SCHEDULE.flatMap((round) =>
    round.matches.map(([a, b]) => {
      const group = `Grupo ${teamByNumber(a).group}`
      return {
        tournament_id: tournamentId,
        stage_id: stageId.get(group) ?? null,
        group_label: group,
        matchday: round.matchday,
        slot: round.slot,
        kickoff: new Date(round.kickoff).toISOString(),
        team_a_id: teamId.get(a),
        team_b_id: teamId.get(b),
      }
    }),
  )

  const faltan = rows.filter((row) => !row.team_a_id || !row.team_b_id)
  if (faltan.length > 0) throw new Error(`fixture: hay ${faltan.length} cruces sin equipo`)

  // upsert contra la unica de (tournament_id, matchday, slot, team_a_id,
  // team_b_id): repetir el seed no duplica cruces ni desengancha las partidas
  // que ya se hayan vinculado, porque match_id no esta en el update.
  const { error } = await supabase
    .from('fixtures')
    .upsert(rows, { onConflict: 'tournament_id,matchday,slot,team_a_id,team_b_id' })

  if (error) throw new Error(`fixture: ${error.message}`)
}

/**
 * Mete a los dos primeros de cada grupo en los cuartos, segun la tabla de hoy.
 *
 * Va aparte y no dentro del seed porque depende de resultados: mientras la fase
 * de grupos no haya terminado, la tabla puede cambiar y los cuartos quedarian
 * mal. Se corre una vez, cuando cierra la ultima fecha. Es idempotente: volver a
 * correrlo simplemente vuelve a leer la tabla.
 */
async function seedQuarters(tournamentId: string): Promise<void> {
  const { data: standings } = await supabase
    .from('group_standings')
    .select('group_label,team_id,position')
    .eq('tournament_id', tournamentId)
    .lte('position', 2)

  const qualified = new Map<string, string>()
  for (const row of standings ?? []) {
    qualified.set(`${row.position}${(row.group_label as string).slice(-1)}`, row.team_id as string)
  }

  const { data: quarters } = await supabase
    .from('series')
    .select('id,order_index,slot_a_label,slot_b_label')
    .eq('round', 'Cuartos de final')

  for (const quarter of quarters ?? []) {
    // "1º A" -> "1A", que es como estan armadas las claves de `qualified`.
    // Por posicion y letra y no por texto exacto, asi sobrevive a que alguien
    // reescriba la etiqueta.
    const key = (label: string | null) => {
      const match = label?.match(/^(\d)\D*([A-D])$/)
      return match ? `${match[1]}${match[2]}` : ''
    }
    await supabase
      .from('series')
      .update({
        team_a_id: qualified.get(key(quarter.slot_a_label as string)) ?? null,
        team_b_id: qualified.get(key(quarter.slot_b_label as string)) ?? null,
      })
      .eq('id', quarter.id)
  }
}

/**
 * Deja la base como estaba: borra todo lo que creo el seed y devuelve las
 * partidas de LEIF a estar sueltas.
 *
 * El orden importa. Si se borra el torneo antes de desvincular los equipos que
 * no creo el seed, el cascade se los lleva puestos junto con sus rosters. Y las
 * partidas se sueltan antes que nada, porque despues relink_all_matches() les
 * vuelve a deducir los equipos a partir de quienes jugaron.
 */
async function clean(tournamentId: string): Promise<void> {
  const { error: matchError } = await supabase
    .from('matches')
    .update({ tournament_id: null, stage_label: null, blue_team_id: null, red_team_id: null })
    .eq('tournament_id', tournamentId)

  if (matchError) throw new Error(`partidas: ${matchError.message}`)

  const { error: relinkError } = await supabase.rpc('relink_all_matches')
  if (relinkError) {
    console.log(`  Aviso: no se pudo revincular los equipos (${relinkError.message}).`)
    console.log('  Las partidas quedan sueltas; se arregla desde /teams/detectar.')
  }

  // Que un equipo lo haya creado el seed no se decide por el nombre: una
  // corrida anterior pudo haber usado otros, y de hecho paso cuando los equipos
  // eran placeholders inventados. Lo que los separa es el plantel: los que
  // salieron de los replays tienen team_members y los del seed no.
  const { data: delTorneo } = await supabase
    .from('teams')
    .select('id,name,team_members(count)')
    .eq('tournament_id', tournamentId)

  const conPlantel: string[] = []
  const sinPlantel: string[] = []

  for (const team of delTorneo ?? []) {
    const miembros = (team.team_members as { count: number }[] | null)?.[0]?.count ?? 0
    if (miembros > 0) conPlantel.push(team.id as string)
    else sinPlantel.push(team.id as string)
  }

  // Los que tienen plantel se desvinculan en vez de borrarse: son equipos
  // detectados de partidas de verdad y el cascade se llevaria sus rosters.
  if (conPlantel.length > 0) {
    await supabase
      .from('teams')
      .update({ tournament_id: null, group_label: null, university_id: null })
      .in('id', conPlantel)
  }

  // team_universities y fixtures se van por cascade con los equipos y el torneo,
  // igual que stages y series.
  if (sinPlantel.length > 0) {
    await supabase.from('teams').delete().in('id', sinPlantel)
  }

  await supabase.from('tournaments').delete().eq('id', tournamentId)

  // Las universidades que quedaron sin ningun equipo. Se mira asi y no por la
  // lista de UNIVERSITIES porque una corrida vieja pudo haber cargado otras
  // (la primera version del seed inventaba trece que no eran estas).
  const { data: universidades } = await supabase.from('universities').select('id,tag')
  const { data: enUso } = await supabase.from('teams').select('university_id')

  const usadas = new Set((enUso ?? []).map((team) => team.university_id).filter(Boolean))
  const huerfanas = (universidades ?? [])
    .filter((university) => !usadas.has(university.id))
    .map((university) => university.id as string)

  if (huerfanas.length > 0) {
    await supabase.from('universities').delete().in('id', huerfanas)
  }
}

async function main() {
  const limpiar = process.argv.includes('--limpiar')
  const clasificados = process.argv.includes('--clasificados')

  if (clasificados) {
    const existing = await findTournament()
    if (!existing) throw new Error('No hay torneo cargado. Corre antes: npm run seed:lide2')

    await seedQuarters(existing)

    const { data: quarters } = await supabase
      .from('series_results')
      .select('slot_a_label,slot_b_label,team_a_name,team_b_name')
      .eq('tournament_id', existing)
      .eq('round', 'Cuartos de final')
      .order('order_index')

    console.log('')
    for (const q of quarters ?? []) {
      const a = (q.team_a_name as string | null) ?? `${q.slot_a_label} (sin definir)`
      const b = (q.team_b_name as string | null) ?? `${q.slot_b_label} (sin definir)`
      console.log(`  ${a} vs ${b}`)
    }
    console.log('')
    return
  }

  if (limpiar) {
    const existing = await findTournament()
    if (!existing) {
      console.log('\n  No hay nada que limpiar.\n')
      return
    }
    await clean(existing)
    console.log('\n  Listo: torneo, equipos, fixture, planteles y universidades borrados.\n')
    return
  }

  const tournamentId = await createStructure()

  const count = (table: string) =>
    supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId)

  const [teams, matches, series, fixtures, jugados] = await Promise.all([
    count('teams'),
    count('matches'),
    count('series_results'),
    count('fixtures'),
    supabase
      .from('fixture_results')
      .select('id', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId)
      .eq('status', 'jugado'),
  ])

  console.log(`\n  Torneo ${TOURNAMENT.name} listo (${tournamentId})`)
  console.log(`  ${teams.count ?? 0} equipos en ${GROUPS.length} grupos`)
  console.log(
    `  ${fixtures.count ?? 0} cruces de fase de grupos (${jugados.count ?? 0} con resultado)`,
  )
  const { count: inscriptos } = await supabase
    .from('team_roster')
    .select('id', { count: 'exact', head: true })

  console.log(`  ${inscriptos ?? 0} inscriptos en los planteles`)
  console.log(`  ${series.count ?? 0} series de playoffs encadenadas`)
  console.log(`  ${matches.count ?? 0} partidas asociadas`)
  console.log('')
}

main().catch((error) => {
  console.error(`\n  ${error instanceof Error ? error.message : error}\n`)
  process.exit(1)
})
