import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AddAccount } from '@/components/admin/AddAccount'
import { AssignAccount } from '@/components/admin/AssignAccount'
import { AssignRole } from '@/components/admin/AssignRole'
import { RosterReview } from '@/components/admin/RosterReview'
import { LIST_COLUMNS, MatchList, type ListMatch } from '@/components/match/MatchList'
import { OpggLink } from '@/components/tournament/OpggLink'
import {
  UniversityLogo,
  UniversityLogos,
} from '@/components/tournament/UniversityLogo'
import { getUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { maybeRow, rows } from '@/lib/supabase/query'
import { assetVersion, championNames } from '@/lib/ddragon'
import { TOURNAMENT } from '@/lib/lide2/tournament'
import { loadMatchDetails } from '@/lib/matches'
import { formatNumber, formatPosition, playerName, riotTag } from '@/lib/format'
import type {
  PlayerTotalsRow,
  RosterReviewRow,
  TeamAccountRow,
  TeamLineupRow,
} from '@/types/db'
import { isUuid, originFrom, playerPath } from '@/lib/routes'
import { withQuery } from '@/lib/url'
import { addPlayerAction, deleteTeamAction, removePlayerAction } from '../actions'

export const dynamic = 'force-dynamic'

/**
 * How many recent matches the team page shows. The full history is /partidas
 * with the team filter set.
 */
const RECENT_MATCHES = 5

/**
 * A signup from the registration sheet: a person's legal name, not a Riot
 * account (`player`). Linked through `player_id` once matched.
 */
interface RosterRow {
  id: string
  full_name: string
  display_name: string | null
  order_index: number
  player_id: string | null
  universities: { tag: string } | null
}

/**
 * Tab title and link preview. A separate minimal query by primary key: the
 * Supabase client does not use `fetch`, so Next would not deduplicate it with
 * the page's query anyway.
 */
export async function generateMetadata({ params }: PageProps<'/equipos/[id]'>) {
  const { id } = await params
  const { data } = await (await createClient()).from('teams').select('name').eq('id', id).maybeSingle()

  const name = (data?.name as string) ?? 'Equipo'
  return { title: name, description: `Plantel, récord y números de ${name} en la ${TOURNAMENT.name}.` }
}

export default async function TeamPage({ params, searchParams }: PageProps<'/equipos/[id]'>) {
  // The page is public; editing controls and signups' legal names need a session.
  const user = await getUser()
  const { id } = await params

  // Where the back arrow leads. Without `desde` (a pasted link, a search engine)
  // it goes to the team list. See ORIGINS in @/lib/routes.
  const volver = originFrom((await searchParams).desde, 'equipos')

  const supabase = await createClient()
  const [teamRes, lineupRes, totalsRes, rosterRes, unisRes, accountsRes, reviewRes, matchesRes] =
    await Promise.all([
      supabase.from('teams').select('id,name,tag').eq('id', id).maybeSingle(),
      // Lineup slots: the five roles always exist, bench slots follow the number
      // of signups, and a nick appears once that person has played and been
      // matched. See 0014_plantel.sql.
      supabase.from('team_lineup').select('*').eq('team_id', id).order('slot'),
      supabase.from('player_totals').select('*').order('games', { ascending: false }),
      supabase
        .from('team_roster')
        .select('id,full_name,display_name,order_index,player_id,universities(tag)')
        .eq('team_id', id)
        .order('order_index'),
      // The universities the team represents, main one first (mixed teams have
      // up to three). `team_universities` is publicly readable.
      supabase
        .from('team_universities')
        .select('order_index,universities(tag,name)')
        .eq('team_id', id)
        .order('order_index'),
      // The team's accounts, to link each signup to one. Session only: it is
      // used next to the signups' legal names.
      user
        ? supabase.from('team_accounts').select('*').eq('team_id', id)
        : Promise.resolve({ data: [], error: null }),
      // Roster issues from the last matchday. The view is `security_invoker` over
      // tables with no `anon` policy, so it is skipped without a session. See 0023.
      user
        ? supabase.from('roster_review').select('*').eq('team_id', id)
        : Promise.resolve({ data: [], error: null }),
      // The team's recent matches, from either side. `or()` takes a raw filter
      // expression and the id comes from the URL, so it must look like a uuid;
      // otherwise the team does not exist and the page 404s below.
      isUuid(id)
        ? supabase
            .from('match_summaries')
            .select(LIST_COLUMNS)
            .or(`blue_team_id.eq.${id},red_team_id.eq.${id}`)
            .order('played_at', { ascending: false, nullsFirst: false })
            .limit(RECENT_MATCHES)
        : Promise.resolve({ data: [], error: null }),
    ])

  const team = maybeRow<{ id: string; name: string; tag: string | null }>(teamRes, 'the team')
  if (!team) notFound()

  const universities = rows<{ universities: { tag: string; name: string } | null }>(
    unisRes as never,
    'the team universities',
  ).flatMap((row) => (row.universities ? [row.universities] : []))

  const lineup = rows<TeamLineupRow>(lineupRes, 'the lineup')
  const roster = rows<RosterRow>(rosterRes as never, 'the signups')
  const accounts = rows<TeamAccountRow>(accountsRes as never, 'the team accounts')
  const review = rows<RosterReviewRow>(reviewRes as never, 'the roster review')
  const totals = rows<PlayerTotalsRow>(totalsRes, 'the per-player totals')
  const matches = rows<ListMatch>(matchesRes as never, 'the recent matches')

  // Match list rows also need both scoreboards and champion names. Loaded after
  // the batch above because they need its match ids.
  const version = await assetVersion(null)
  const [detalle, champNames] = await Promise.all([
    loadMatchDetails(
      supabase,
      matches.map((match) => match.id),
    ),
    championNames(version),
  ])

  const memberIds = new Set(lineup.flatMap((slot) => (slot.player_id ? [slot.player_id] : [])))
  const confirmados = memberIds.size

  // Accounts for the op.gg multisearch. Taken from the lineup, which is public,
  // rather than `team_accounts`, which needs a session.
  const cuentas = lineup
    .filter((slot) => slot.player_id)
    .map((slot) => ({ gameName: slot.game_name, tagLine: slot.tag_line }))

  const statsByPlayer = new Map(totals.map((t) => [t.player_id, t]))
  // Accounts with matches played and no team: candidates to add.
  const available = totals.filter((t) => !memberIds.has(t.player_id) && !t.team_id)

  return (
    <div className="flex flex-col gap-6">
      <Link href={volver.href} className="text-sm text-muted transition-colors hover:text-fg">
        ← {volver.label}
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-3">
          <UniversityLogos tags={universities.map((u) => u.tag)} size="xl" max={3} />
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">{team.name}</h1>
            {/* The universities' full names; "Equipo 15" alone says little. */}
            {universities.length > 0 && (
              <p className="mt-1 text-sm text-muted">
                {universities.map((u) => u.name).join(' · ')}
              </p>
            )}
          </div>
        </div>
        {/*
          op.gg shows rank and champion pool, which the replays do not have. It is
          in the header because it covers the whole team, not just the lineup.
        */}
        <div className="flex items-center gap-3">
          <OpggLink accounts={cuentas} />
          {user && (
            <form action={deleteTeamAction}>
              <input type="hidden" name="teamId" value={team.id} />
              <button
                type="submit"
                className="rounded border border-line-strong px-3 py-1.5 text-sm text-muted transition-colors hover:border-accent hover:text-accent"
              >
                Eliminar equipo
              </button>
            </form>
          )}
        </div>
      </div>

      {user && roster.length > 0 && (
        <section className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-sm font-medium text-muted">
              Inscriptos ({roster.filter((entry) => entry.player_id).length}/{roster.length} con
              nick)
            </h2>
            {/*
              Legal names from the signup sheet, never public: team_roster is
              readable by `authenticated` only (see 0008_rosters.sql).
            */}
            <span className="text-xs text-dim">Sólo visible con sesión</span>
          </div>
          <ul className="divide-y divide-line rounded-lg border border-line">
            {roster.map((entry, index) => (
              <li key={entry.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 text-sm">
                {/* Position in the list, not `order_index`, which has gaps
                    after removals. */}
                <span className="tabular w-5 shrink-0 text-right text-xs text-dim">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {entry.display_name ?? entry.full_name}
                </span>
                {entry.universities?.tag && (
                  <span className="flex shrink-0 items-center gap-1.5">
                    <UniversityLogo tag={entry.universities.tag} size="xs" />
                    <span className="text-xs text-faint">{entry.universities.tag}</span>
                  </span>
                )}
                {/* Which account belongs to this signup. Nicks matching the
                    declared Riot ID are linked automatically. */}
                <AssignAccount
                  teamId={team.id}
                  rosterId={entry.id}
                  playerId={entry.player_id}
                  accounts={accounts}
                />
              </li>
            ))}
          </ul>
          <p className="text-xs text-dim">
            El desplegable son los nicks del plantel, hayan jugado o no. Emparejarlos sirve para las
            estadísticas por universidad: sin eso, las partidas de cada cuenta cuentan para la
            universidad del equipo y no para la que declaró su dueño.
          </p>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-sm font-medium text-muted">Plantel</h2>
          {/* Plain wording for visitors, and no "0 de 5" when none is
              confirmed. */}
          {confirmados < lineup.length && (
            <span className="text-xs text-dim">
              {confirmados === 0
                ? 'Sin confirmar'
                : `${confirmados} de ${lineup.length} confirmados`}
            </span>
          )}
        </div>
        {/*
          Empty slots still show their role, and fill in as replays are uploaded.
          The note below explains where lanes come from, so a nick in an
          unexpected lane, a slot that changes after an upload or a "No jugó"
          badge do not look like bugs.
        */}
        <p className="text-xs text-dim">
          Las líneas salen de las partidas jugadas: cada cuenta queda en la que más jugó y se
          actualiza sola con cada replay que se sube. Lo que se carga a mano antes de jugar es
          provisorio y sirve hasta que haya una partida que lo confirme o lo corrija.
        </p>
        <ul className="divide-y divide-line rounded-lg border border-line">
          {lineup.map((slot) => {
            const stats = slot.player_id ? statsByPlayer.get(slot.player_id) : null
            const tag = riotTag(slot.game_name, slot.tag_line, slot.name)
            return (
              <li
                key={slot.slot}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 text-sm"
              >
                <span className="w-24 shrink-0 text-xs text-faint">
                  {slot.role ? formatPosition(slot.role) : 'Sin posición'}
                </span>
                {slot.player_id ? (
                  /* The #TAG next to the nick tells apart players with the
                     same name. */
                  <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
                    <Link
                      href={playerPath(slot.player_id)}
                      className="truncate font-medium transition-colors hover:text-accent"
                    >
                      {playerName(slot.name)}
                    </Link>
                    {tag && <span className="shrink-0 text-xs text-faint">{tag}</span>}
                    {/* Entered by hand, and the team has played without this
                        account. Different from an empty slot. */}
                    {slot.did_not_play && (
                      <span className="shrink-0 rounded bg-raised px-1.5 py-0.5 text-xs text-faint">
                        No jugó
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="min-w-0 flex-1 truncate text-dim">Por confirmar</span>
                )}
                {stats && (
                  <>
                    <span className="tabular w-20 text-right text-faint">
                      {stats.games} partidas
                    </span>
                    <span className="tabular w-16 text-right text-muted">{stats.kda} KDA</span>
                  </>
                )}
                {user && slot.player_id && (
                  <>
                    {/* The effective lane may come from matches; this is the
                        hand assignment. */}
                    <AssignRole teamId={team.id} playerId={slot.player_id} role={slot.assigned_role} />
                    <form action={removePlayerAction}>
                      <input type="hidden" name="teamId" value={team.id} />
                      <input type="hidden" name="playerId" value={slot.player_id} />
                      <button
                        type="submit"
                        className="text-xs text-faint transition-colors hover:text-accent"
                      >
                        Quitar
                      </button>
                    </form>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      {/*
        Recent matches, below the lineup. Same rows as /partidas, with this
        team's side underlined; the button opens /partidas with the team filter
        set for the full history.
      */}
      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-sm font-medium text-muted">Últimas partidas</h2>
          {matches.length > 0 && (
            <Link
              href={withQuery('/partidas', { equipo: team.id })}
              className="text-xs font-bold uppercase tracking-wide text-accent transition-colors hover:text-accent-soft"
            >
              Historial completo →
            </Link>
          )}
        </div>

        {matches.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line-strong px-4 py-6 text-center text-sm text-fg-soft">
            Todavía no hay ninguna partida de este equipo con el replay cargado.
          </p>
        ) : (
          <MatchList
            from="equipos"
            matches={matches}
            playersByMatch={detalle.playersByMatch}
            statsByMatch={detalle.statsByMatch}
            version={version}
            championNames={champNames}
            team={team.id}
          />
        )}
      </section>

      {/* Roster issues left by the matchday: first the lineup, then what does
          not add up in it. */}
      {user && <RosterReview teamId={team.id} rows={review} />}

      {user && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted">
            Agregar jugador ({available.length} sin equipo)
          </h2>
          {/*
            Typing a nick is the only way to add a player before any match is
            played: the list below only has accounts seen in replays.
          */}
          <AddAccount teamId={team.id} />
          <p className="text-xs text-dim">
            Si esa persona todavía no jugó, escribí su nick igual: la cuenta queda cargada sin
            partidas y se engancha sola con su primer replay. La lista de abajo son las cuentas
            que ya jugaron y no están en ningún equipo.
          </p>
          <ul className="max-h-96 divide-y divide-line overflow-y-auto rounded-lg border border-line">
            {available.map((player) => {
              const tag = riotTag(player.riot_game_name, player.riot_tag_line, player.display_name)
              return (
                <li key={player.player_id} className="flex items-center gap-4 px-4 py-2 text-sm">
                  <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
                    <span className="truncate">
                      {playerName(player.riot_game_name, player.display_name)}
                    </span>
                    {tag && <span className="shrink-0 text-xs text-faint">{tag}</span>}
                  </span>
                  <span className="tabular w-20 text-right text-faint">{player.games} partidas</span>
                  <span className="tabular hidden w-24 text-right text-faint sm:inline">
                    {formatNumber(player.avg_damage)} daño
                  </span>
                  <form action={addPlayerAction}>
                    <input type="hidden" name="teamId" value={team.id} />
                    <input type="hidden" name="playerId" value={player.player_id} />
                    <button
                      type="submit"
                      className="text-xs text-accent transition-colors hover:text-accent-soft"
                    >
                      Agregar
                    </button>
                  </form>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}
