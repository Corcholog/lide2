import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { rows } from '@/lib/supabase/query'
import { TOURNAMENT } from '@/lib/lide2/tournament'
import { RosterImport } from '@/components/admin/RosterImport'
import { RosterTeam, type UniversityOption } from '@/components/admin/RosterTeam'
import type { RosterStatusRow, TeamAccountRow } from '@/types/db'

export const dynamic = 'force-dynamic'

/**
 * Los planteles: quiénes están anotados en cada equipo y qué cuenta de Riot es
 * cada uno.
 *
 * QUIÉNES. La planilla de inscripción es de antes de que empiece el torneo y no
 * es definitiva: se cae gente, entra un suplente, un nombre vino mal escrito.
 * Cada fila se edita, se da de baja y se agregan las que hagan falta; el
 * plantel de un equipo se guarda entero de una vez.
 *
 * QUÉ CUENTA. Emparejar a cada inscripto con su cuenta de Riot sirve para una
 * cosa: la universidad. Dieciséis de los 20 equipos son de una sola casa, y ahí
 * el respaldo (la universidad del equipo) ya es exacto. Los cuatro armados con
 * inscripciones individuales —13, 15, 16 y 17— tienen 2 de cada 5 mal
 * atribuidos. Y hay dos universidades, UADE y UNCuyo, que tienen un solo
 * inscripto cada una y las dos adentro de equipos mezclados: sin este
 * emparejado no aparecen en ninguna tabla.
 *
 * Los nombres de esta pantalla son legales, de un formulario de inscripción. No
 * salen de acá: `team_roster` es la única tabla que se queda detrás del login
 * ahora que el sitio está abierto al público.
 */
export default async function PlantelesPage() {
  await requireUser()

  const supabase = await createClient()
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('id')
    .eq('slug', TOURNAMENT.slug)
    .maybeSingle()

  // Los equipos salen de `teams` y no de los inscriptos: un equipo al que se le
  // dieron de baja los cinco tiene que seguir teniendo su tarjeta, que es el
  // único lugar desde donde se le puede volver a cargar gente.
  const [teamsRes, rosterRes, accountsRes, universitiesRes] = await Promise.all([
    supabase.from('teams').select('id,name,group_label').order('name'),
    supabase.from('roster_status').select('*').order('team_name').order('order_index'),
    supabase.from('team_accounts').select('*'),
    supabase.from('universities').select('id,tag,name').order('tag'),
  ])

  const teams = rows<{ id: string; name: string; group_label: string | null }>(
    teamsRes,
    'los equipos',
  )
  const roster = rows<RosterStatusRow>(rosterRes, 'los inscriptos')
  const accounts = rows<TeamAccountRow>(accountsRes, 'las cuentas enlazadas')
  const universities = rows<UniversityOption>(universitiesRes, 'las universidades')

  const byTeam = new Map<string, RosterStatusRow[]>()
  for (const row of roster) {
    byTeam.set(row.team_id, [...(byTeam.get(row.team_id) ?? []), row])
  }

  const accountsByTeam = new Map<string, TeamAccountRow[]>()
  for (const account of accounts) {
    accountsByTeam.set(account.team_id, [...(accountsByTeam.get(account.team_id) ?? []), account])
  }

  const linked = roster.filter((row) => row.player_id !== null).length
  const declared = roster.filter((row) => row.declared_game_name !== null).length
  const orphans = accounts.filter((account) => !account.linked).length

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl uppercase tracking-tight">Planteles</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Quiénes están anotados en cada equipo y qué cuenta de Riot es cada uno. Los cambios de
            plantel de antes del torneo —altas, bajas y correcciones de nombre— se hacen acá.
          </p>
        </div>
        <Link
          href="/admin/asignar"
          className="border-2 border-line-strong px-4 py-2 text-sm transition-colors hover:border-accent"
        >
          Asignar partidas
        </Link>
      </header>

      <dl className="grid grid-cols-2 gap-0.5 bg-line sm:grid-cols-4">
        <Stat label="Inscriptos" value={roster.length} />
        <Stat label="Emparejados" value={linked} tone={linked === roster.length && linked > 0} />
        <Stat label="Riot ID cargado" value={declared} />
        <Stat label="Cuentas sin dueño" value={orphans} />
      </dl>

      {teams.length === 0 ? (
        <p className="border-2 border-dashed border-line-strong px-6 py-10 text-center text-sm text-fg-soft">
          {tournament
            ? 'No hay equipos cargados.'
            : 'El torneo no está en la base. Corré `npm run seed:lide2`.'}
        </p>
      ) : (
        <>
          <RosterImport />

          <p className="text-xs text-faint">
            El Riot ID se puede cargar antes de que jueguen: cuando aparezca la cuenta en un replay
            se empareja sola. El desplegable sólo muestra cuentas de gente que ya jugó en ese
            equipo, y sirve para los casos en que el nick declarado no coincide con el que usaron.
            Dar de baja a un inscripto no borra su cuenta ni sus partidas: saca el nombre de la
            planilla y achica el banco del plantel.
          </p>

          <div className="grid gap-4">
            {teams.map((team) => (
              <RosterTeam
                key={team.id}
                team={{ id: team.id, name: team.name, groupLabel: team.group_label }}
                rows={byTeam.get(team.id) ?? []}
                accounts={accountsByTeam.get(team.id) ?? []}
                universities={universities}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: boolean }) {
  return (
    <div className="bg-surface px-4 py-3 text-fg">
      <dt className="text-xs uppercase tracking-wide text-faint">{label}</dt>
      <dd className={`font-display text-2xl tabular-nums ${tone ? 'text-ok' : ''}`}>{value}</dd>
    </div>
  )
}
