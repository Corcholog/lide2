import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { rows } from '@/lib/supabase/query'
import { assetVersion, championCatalog, championName, championNames } from '@/lib/ddragon'
import { formatDate } from '@/lib/format'
import { resolveTournamentId } from '@/lib/stats/query'
import { BanEntry } from '@/components/admin/BanEntry'
import type { MatchBanRow, MatchSummaryRow } from '@/types/db'

export const metadata = { title: 'Bans' }

export const dynamic = 'force-dynamic'

/**
 * Entering each match's draft.
 *
 * It is the only step in the panel that does not come out of a file: the .rofl
 * stores the final scoreboard and not the draft, so the ten bans have to be
 * read off the broadcast or the client's history and typed in. It is tedious,
 * and that is why it is worth spelling out what it buys: without this the
 * champion table has pick rate and win rate, but ban rate and presence stay
 * empty.
 *
 * By default the ones with nothing entered are listed, which is what is left to
 * do; with `?estado=todas` they all appear, to fix one that came out wrong.
 */
export default async function BansPage({ searchParams }: PageProps<'/admin/bans'>) {
  await requireUser()

  const supabase = await createClient()
  const tournamentId = await resolveTournamentId(supabase)
  const showAll = (await searchParams).estado === 'todas'

  const matches = tournamentId
    ? rows<MatchSummaryRow>(
        await (showAll
          ? supabase
              .from('match_summaries')
              .select('*')
              .eq('tournament_id', tournamentId)
              .order('played_at', { ascending: false, nullsFirst: false })
              .limit(60)
          : supabase
              .from('match_summaries')
              .select('*')
              .eq('tournament_id', tournamentId)
              .eq('ban_count', 0)
              .order('played_at', { ascending: false, nullsFirst: false })
              .limit(60)),
        'the matches',
      )
    : []

  // The bans only need fetching when the entered ones are being shown: the
  // pending ones, by definition, have none.
  const guardados =
    showAll && matches.length > 0
      ? rows<MatchBanRow>(
          await supabase
            .from('match_bans')
            .select('*')
            .in(
              'match_id',
              matches.map((m) => m.id),
            ),
          'los bans cargados',
        )
      : []

  const version = await assetVersion(null)
  const [catalog, names] = await Promise.all([championCatalog(version), championNames(version)])

  // Each match's bans, indexed the way the form expects them.
  const bansByMatch = new Map<string, Record<string, string>>()
  for (const ban of guardados) {
    const current = bansByMatch.get(ban.match_id) ?? {}
    current[`${ban.side}-${ban.order_index}`] = championName(names, ban.champion)
    bansByMatch.set(ban.match_id, current)
  }

  const withDraft = matches.filter((m) => m.ban_count > 0).length
  const totalBans = matches.reduce((total, m) => total + m.ban_count, 0)

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl uppercase tracking-tight">Bans</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Los diez baneos de cada partida, a mano: el .rofl no guarda el draft. Con esto la
            tabla de campeones puede calcular ban rate y presencia; sin esto, esas dos columnas
            ni se dibujan.
          </p>
        </div>
        <nav aria-label="Filtro" className="flex gap-1">
          <Link
            href="/admin/bans"
            aria-current={!showAll ? 'true' : undefined}
            className={`border-2 px-3 py-1 text-xs font-bold uppercase tracking-wide transition-colors ${
              !showAll
                ? 'border-accent bg-accent-dim text-accent'
                : 'border-line text-muted hover:border-line-strong hover:text-accent'
            }`}
          >
            Sin draft
          </Link>
          <Link
            href="/admin/bans?estado=todas"
            aria-current={showAll ? 'true' : undefined}
            className={`border-2 px-3 py-1 text-xs font-bold uppercase tracking-wide transition-colors ${
              showAll
                ? 'border-accent bg-accent-dim text-accent'
                : 'border-line text-muted hover:border-line-strong hover:text-accent'
            }`}
          >
            Todas
          </Link>
        </nav>
      </header>

      <dl className="grid grid-cols-3 gap-0.5 bg-line">
        <Stat
          label={showAll ? 'Partidas' : 'Sin draft'}
          value={matches.length}
          tone={!showAll && matches.length > 0}
        />
        <Stat label="Con draft" value={withDraft} />
        <Stat label="Bans cargados" value={totalBans} />
      </dl>

      {!tournamentId && (
        <p className="border-2 border-danger/40 bg-danger-dim px-4 py-3 text-sm text-danger">
          El torneo no está cargado en la base. Corré <code>npm run seed:lide2</code>.
        </p>
      )}

      {/*
        ONE datalist for every form's ten fields and for every match on the
        page. One per field would be 170 options x 10 x 60 matches; this way it
        is 170 nodes in total.
      */}
      <datalist id="champions">
        {catalog.map((champ) => (
          <option key={champ.key} value={champ.name} />
        ))}
      </datalist>

      {matches.length === 0 ? (
        <p className="border-2 border-dashed border-line-strong px-6 py-10 text-center text-sm text-fg-soft">
          {showAll
            ? 'Todavía no hay partidas cargadas.'
            : 'Todas las partidas tienen su draft cargado.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {matches.map((match) => {
            const blue = match.blue_team_name ?? 'Lado azul'
            const red = match.red_team_name ?? 'Lado rojo'

            return (
              <li key={match.id}>
                <details className="border-2 border-line bg-surface">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm [&::-webkit-details-marker]:hidden">
                    <span className="text-side-blue">{blue}</span>
                    <span className="text-dim">vs</span>
                    <span className="text-side-red">{red}</span>

                    <span className="text-xs text-faint">
                      {[match.group_label, match.matchday && `Fecha ${match.matchday}`]
                        .filter(Boolean)
                        .join(' · ') || formatDate(match.played_at)}
                    </span>

                    <span
                      className={`ml-auto text-xs font-medium ${
                        match.ban_count > 0 ? 'text-ok' : 'text-accent'
                      }`}
                    >
                      {match.ban_count > 0 ? `${match.ban_count} bans` : 'sin draft'}
                    </span>
                  </summary>

                  <div className="border-t-2 border-line px-4 py-4">
                    <BanEntry
                      matchId={match.id}
                      bans={bansByMatch.get(match.id) ?? {}}
                      teamNames={{ 100: blue, 200: red }}
                    />
                  </div>
                </details>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: boolean }) {
  return (
    <div className="bg-surface px-4 py-3">
      <dt className="text-xs uppercase tracking-wide text-faint">{label}</dt>
      <dd className={`font-display text-2xl tabular-nums ${tone ? 'text-accent' : 'text-fg'}`}>
        {value}
      </dd>
    </div>
  )
}
