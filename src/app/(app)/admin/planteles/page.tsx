import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { rows } from '@/lib/supabase/query'
import { TOURNAMENT } from '@/lib/lide2/tournament'
import { RosterImport } from '@/components/admin/RosterImport'
import { RosterTeam, type UniversityOption } from '@/components/admin/RosterTeam'
import { Stat } from '@/components/admin/Stat'
import type { RosterStatusRow, TeamAccountRow } from '@/types/db'

export const dynamic = 'force-dynamic'

/**
 * Rosters: who is signed up for each team, and which Riot account each signup
 * is.
 *
 * Signups can be edited, removed and added, and a team's roster is saved as a
 * whole. Matching a signup to its account decides which university its games
 * count for: it matters for the mixed teams (13, 15, 16 and 17), and some
 * universities only have players on those teams.
 *
 * Names here are legal names from the signup form. `team_roster` is only
 * readable when signed in.
 */
export default async function RostersPage() {
  await requireUser()

  const supabase = await createClient()
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('id')
    .eq('slug', TOURNAMENT.slug)
    .maybeSingle()

  // Teams come from `teams`, not from signups, so a team whose signups were all
  // removed keeps its card and can get new ones.
  const [teamsRes, rosterRes, accountsRes, universitiesRes] = await Promise.all([
    supabase.from('teams').select('id,name,group_label').order('name'),
    supabase.from('roster_status').select('*').order('team_name').order('order_index'),
    supabase.from('team_accounts').select('*'),
    supabase.from('universities').select('id,tag,name').order('tag'),
  ])

  const teams = rows<{ id: string; name: string; group_label: string | null }>(
    teamsRes,
    'the teams',
  )
  const roster = rows<RosterStatusRow>(rosterRes, 'the signups')
  const accounts = rows<TeamAccountRow>(accountsRes, 'the linked accounts')
  const universities = rows<UniversityOption>(universitiesRes, 'the universities')

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
        <Stat
          label="Emparejados"
          value={linked}
          tone={linked === roster.length && linked > 0}
          toneClass="text-ok"
        />
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
            se empareja sola. El desplegable muestra los nicks del plantel de ese equipo, hayan
            jugado o no —los que se cargan a mano desde la ficha del equipo también están—, y sirve
            para los casos en que el nick declarado no coincide con el que usaron. Lo mismo se
            puede hacer de a uno desde la ficha de cada equipo. Dar de baja a un inscripto no borra
            su cuenta ni sus partidas: saca el nombre de la planilla y achica el banco del plantel.
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
