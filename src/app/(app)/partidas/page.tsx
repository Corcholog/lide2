import Link from 'next/link'
import { getUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { rows } from '@/lib/supabase/query'
import { formatDate, formatDuration, formatGold, formatKda } from '@/lib/format'
import type { MatchSummaryRow } from '@/types/db'

export const metadata = {
  title: 'Partidas',
  description: 'Todas las partidas jugadas, con su marcador, su duración y su MVP.',
}

export const dynamic = 'force-dynamic'

export default async function MatchesPage() {
  // La lista se ve sin sesión; subir replays, no.
  const user = await getUser()
  const supabase = await createClient()
  // El cartel de error que tenía esta página se fue al error.tsx del sitio:
  // era el único lugar donde un fallo se veía, y encima mostraba el mensaje
  // crudo de Postgres a cualquiera que entrara.
  const matches = rows<MatchSummaryRow>(
    await supabase
      .from('match_summaries')
      .select('*')
      .order('played_at', { ascending: false, nullsFirst: false })
      .limit(100),
    'las partidas',
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Partidas</h1>
          <p className="mt-1 text-sm text-muted">
            {matches.length === 0
              ? 'Todavía no hay partidas cargadas.'
              : `${matches.length} partida${matches.length === 1 ? '' : 's'} cargada${matches.length === 1 ? '' : 's'}.`}
          </p>
        </div>
        {user && (
          <Link
            href="/admin/upload"
            className="rounded bg-accent-strong px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent"
          >
            Subir replays
          </Link>
        )}
      </div>

      {matches.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line-strong px-6 py-14 text-center">
          <p className="text-fg-soft">Subí los .rofl de las partidas jugadas para empezar.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {matches.map((match) => (
            <li key={match.id}>
              <Link
                href={`/partidas/${match.id}`}
                className="flex items-center gap-4 rounded-lg border border-line bg-surface px-4 py-3 transition-colors hover:border-accent"
              >
                <div className="w-28 shrink-0 text-xs text-faint">
                  <p className="tabular">{formatDate(match.played_at)}</p>
                  <p>
                    {[match.stage_label, match.round_label].filter(Boolean).join(' · ') ||
                      `parche ${match.patch ?? '?'}`}
                  </p>
                </div>

                <div className="flex flex-1 items-center justify-center gap-4">
                  <SideName
                    name={match.blue_team_name}
                    fallback="Lado azul"
                    won={match.winning_side === 100}
                    align="right"
                    accent="aqua"
                  />
                  <div className="tabular shrink-0 text-center">
                    <p className="text-lg font-bold">
                      <span className={match.winning_side === 100 ? 'text-side-blue' : 'text-muted'}>
                        {match.blue_kills ?? 0}
                      </span>
                      <span className="mx-1 text-dim">–</span>
                      <span className={match.winning_side === 200 ? 'text-side-red' : 'text-muted'}>
                        {match.red_kills ?? 0}
                      </span>
                    </p>
                    <p className="text-xs text-faint">{formatDuration(match.game_length_ms)}</p>
                  </div>
                  <SideName
                    name={match.red_team_name}
                    fallback="Lado rojo"
                    won={match.winning_side === 200}
                    align="left"
                    accent="red"
                  />
                </div>

                <div className="hidden w-52 shrink-0 text-right text-xs md:block">
                  {match.mvp_champion ? (
                    <>
                      <p className="text-fg-soft">
                        <span className="text-faint">MVP </span>
                        {match.mvp_name ?? match.mvp_champion}
                      </p>
                      <p className="tabular text-faint">
                        {match.mvp_champion} ·{' '}
                        {formatKda(match.mvp_kills ?? 0, match.mvp_deaths ?? 0, match.mvp_assists ?? 0)}
                      </p>
                    </>
                  ) : (
                    <p className="text-dim">sin MVP</p>
                  )}
                </div>

                <div className="tabular hidden w-20 shrink-0 text-right text-xs text-faint lg:block">
                  {formatGold((match.blue_gold ?? 0) + (match.red_gold ?? 0))} oro
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function SideName({
  name,
  fallback,
  won,
  align,
  accent,
}: {
  name: string | null
  fallback: string
  won: boolean
  align: 'left' | 'right'
  accent: 'aqua' | 'red'
}) {
  const color = won ? (accent === 'aqua' ? 'text-side-blue' : 'text-side-red') : 'text-fg-soft'

  return (
    <p
      className={`min-w-0 flex-1 truncate text-sm font-medium ${color} ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      {name ?? <span className="text-dim">{fallback}</span>}
    </p>
  )
}
