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
 * The rosters: who is signed up for each team and which Riot account each one
 * is.
 *
 * WHO. The signup sheet predates the tournament and is not final: people drop
 * out, a substitute comes in, a name arrived misspelled. Every row can be
 * edited or removed and new ones added; a team's roster is saved whole, at
 * once.
 *
 * WHICH ACCOUNT. Matching each signup with their Riot account buys one thing:
 * the university. Sixteen of the 20 teams come from a single one, and there the
 * fallback (the team's university) is already exact. The four built from
 * individual signups - 13, 15, 16 and 17 - have 2 out of every 5 misattributed.
 * And there are two universities, UADE and UNCuyo, with a single signup each
 * and both inside mixed teams: without this matching they appear in no table at
 * all.
 *
 * The names on this screen are legal names, from a signup form. They never
 * leave here: `team_roster` is the only table that stays behind the login now
 * that the site is open to the public.
 */
export default async function RostersPage() {
  await requireUser()

  const supabase = await createClient()
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('id')
    .eq('slug', TOURNAMENT.slug)
    .maybeSingle()

  // The teams come from `teams` and not from the signups: a team whose five
  // were all removed still has to keep its card, which is the only place from
  // which people can be added back.
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
          href="/admin/assign"
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

function Stat({ label, value, tone }: { label: string; value: number; tone?: boolean }) {
  return (
    <div className="bg-surface px-4 py-3 text-fg">
      <dt className="text-xs uppercase tracking-wide text-faint">{label}</dt>
      <dd className={`font-display text-2xl tabular-nums ${tone ? 'text-ok' : ''}`}>{value}</dd>
    </div>
  )
}
