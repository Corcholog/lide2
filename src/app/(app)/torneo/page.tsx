import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatDate, formatDuration } from '@/lib/format'
import type { MatchSummaryRow, TeamStandingRow } from '@/types/db'

export const dynamic = 'force-dynamic'

const SIN_ETAPA = 'sin-etapa'

interface Stage {
  /** El valor tal cual está en matches.stage_label; null también es una etapa. */
  value: string | null
  /** Clave para el ?etapa= de la URL. */
  key: string
  label: string
  matches: MatchSummaryRow[]
  firstAt: number
}

/** "Fecha 10" va después de "Fecha 9", no entre "Fecha 1" y "Fecha 2". */
function roundOrder(label: string | null): number {
  const digits = label?.match(/\d+/)
  return digits ? Number(digits[0]) : Number.MAX_SAFE_INTEGER
}

function time(iso: string | null): number {
  return iso ? new Date(iso).getTime() : Number.MAX_SAFE_INTEGER
}

/** Agrupa las partidas por etapa, en el orden en que se jugaron. */
function buildStages(matches: MatchSummaryRow[]): Stage[] {
  const stages = new Map<string, Stage>()

  for (const match of matches) {
    const key = match.stage_label ?? SIN_ETAPA
    const stage = stages.get(key) ?? {
      value: match.stage_label,
      key,
      label: match.stage_label ?? 'Sin etapa',
      matches: [],
      firstAt: Number.MAX_SAFE_INTEGER,
    }
    stage.matches.push(match)
    stage.firstAt = Math.min(stage.firstAt, time(match.played_at))
    stages.set(key, stage)
  }

  return [...stages.values()].sort((a, b) => a.firstAt - b.firstAt || a.label.localeCompare(b.label))
}

/** Las jornadas de una etapa, ordenadas por número de fecha. */
function buildRounds(matches: MatchSummaryRow[]): { label: string; matches: MatchSummaryRow[] }[] {
  const rounds = new Map<string, MatchSummaryRow[]>()

  for (const match of matches) {
    const label = match.round_label ?? 'Sin fecha'
    rounds.set(label, [...(rounds.get(label) ?? []), match])
  }

  return [...rounds.entries()]
    .map(([label, list]) => ({
      label,
      matches: list.sort((a, b) => time(a.played_at) - time(b.played_at)),
    }))
    .sort((a, b) => roundOrder(a.label) - roundOrder(b.label) || a.label.localeCompare(b.label))
}

export default async function TournamentPage({ searchParams }: PageProps<'/torneo'>) {
  await requireUser()
  const params = await searchParams

  const supabase = await createClient()
  const [standingsRes, matchesRes] = await Promise.all([
    supabase.from('team_standings').select('*').order('position'),
    supabase
      .from('match_summaries')
      .select('*')
      .order('played_at', { ascending: true, nullsFirst: false })
      .limit(500),
  ])

  const standings = (standingsRes.data ?? []) as TeamStandingRow[]
  const matches = (matchesRes.data ?? []) as MatchSummaryRow[]
  const error = standingsRes.error ?? matchesRes.error

  const stages = buildStages(matches)
  const selected = stages.find((stage) => stage.key === params.etapa) ?? stages[0]
  const table = selected
    ? standings
        .filter((row) => row.stage_label === selected.value)
        .sort((a, b) => a.position - b.position)
    : []
  const rounds = selected ? buildRounds(selected.matches) : []

  // Sin los dos equipos vinculados la partida no entra en ninguna tabla.
  const unlinked = matches.filter((match) => !match.blue_team_id || !match.red_team_id).length

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Torneo</h1>
        <p className="mt-1 text-sm text-ink-400">
          {matches.length === 0
            ? 'Todavía no hay partidas cargadas.'
            : `${matches.length} partidas · ${stages.length} ${
                stages.length === 1 ? 'etapa' : 'etapas'
              } · ${standings.length} equipos en tabla.`}
        </p>
      </div>

      {error && (
        <p className="rounded border border-brand-red/40 bg-brand-red-dim/40 px-4 py-3 text-sm text-brand-red-soft">
          No se pudo leer la tabla: {error.message}
        </p>
      )}

      {unlinked > 0 && (
        <p className="rounded border border-ink-700 bg-ink-900 px-4 py-3 text-sm text-ink-300">
          {unlinked} {unlinked === 1 ? 'partida no tiene' : 'partidas no tienen'} los dos equipos
          vinculados, así que {unlinked === 1 ? 'no suma' : 'no suman'} en la tabla.{' '}
          <Link href="/teams/detectar" className="text-brand-aqua transition-colors hover:text-brand-aqua-soft">
            Detectar equipos
          </Link>
        </p>
      )}

      {!selected ? (
        <div className="rounded-lg border border-dashed border-ink-700 px-6 py-14 text-center">
          <p className="text-ink-300">Subí los .rofl para que se arme la tabla.</p>
        </div>
      ) : (
        <>
          {stages.length > 1 && (
            <nav className="flex flex-wrap gap-2">
              {stages.map((stage) => (
                <Link
                  key={stage.key}
                  href={`/torneo?etapa=${encodeURIComponent(stage.key)}`}
                  className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
                    stage.key === selected.key
                      ? 'bg-ink-100 font-medium text-ink-950'
                      : 'border border-ink-700 text-ink-300 hover:border-ink-500'
                  }`}
                >
                  {stage.label}
                </Link>
              ))}
            </nav>
          )}

          {table.length === 0 ? (
            <p className="rounded-lg border border-dashed border-ink-700 px-6 py-10 text-center text-sm text-ink-300">
              Ninguna partida de {selected.label} tiene los dos equipos vinculados todavía.
            </p>
          ) : (
            <Standings rows={table} />
          )}

          <section className="flex flex-col gap-5">
            <h2 className="text-sm font-medium text-ink-400">Resultados de {selected.label}</h2>

            {rounds.map((round) => (
              <div key={round.label} className="flex flex-col gap-2">
                <div className="flex items-baseline gap-3">
                  <h3 className="text-sm font-semibold">{round.label}</h3>
                  <span className="text-xs text-ink-500">
                    {formatDate(round.matches[0]?.played_at ?? null)} · {round.matches.length}{' '}
                    {round.matches.length === 1 ? 'partida' : 'partidas'}
                  </span>
                </div>

                <ul className="divide-y divide-ink-800 rounded-lg border border-ink-800">
                  {round.matches.map((match) => (
                    <li key={match.id}>
                      <Link
                        href={`/matches/${match.id}`}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-ink-900"
                      >
                        <span
                          className={`min-w-0 flex-1 truncate text-right ${
                            match.winning_side === 100 ? 'font-medium text-ink-100' : 'text-ink-400'
                          }`}
                        >
                          {match.blue_team_name ?? <span className="text-ink-600">Lado azul</span>}
                        </span>

                        <span className="tabular shrink-0 text-center">
                          <span
                            className={match.winning_side === 100 ? 'text-brand-aqua' : 'text-ink-500'}
                          >
                            {match.blue_kills ?? 0}
                          </span>
                          <span className="mx-1 text-ink-600">–</span>
                          <span
                            className={
                              match.winning_side === 200 ? 'text-brand-red-soft' : 'text-ink-500'
                            }
                          >
                            {match.red_kills ?? 0}
                          </span>
                        </span>

                        <span
                          className={`min-w-0 flex-1 truncate ${
                            match.winning_side === 200 ? 'font-medium text-ink-100' : 'text-ink-400'
                          }`}
                        >
                          {match.red_team_name ?? <span className="text-ink-600">Lado rojo</span>}
                        </span>

                        <span className="tabular hidden w-14 shrink-0 text-right text-xs text-ink-500 sm:block">
                          {formatDuration(match.game_length_ms)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  )
}

function Standings({ rows }: { rows: TeamStandingRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-ink-800">
      <table className="w-full min-w-2xl text-sm">
        <thead className="border-b border-ink-800 text-xs text-ink-500">
          <tr>
            <th className="w-10 px-3 py-2.5 text-right font-medium">#</th>
            <th className="px-3 py-2.5 text-left font-medium">Equipo</th>
            <th className="w-12 px-2 py-2.5 text-right font-medium">PJ</th>
            <th className="w-12 px-2 py-2.5 text-right font-medium">G</th>
            <th className="w-12 px-2 py-2.5 text-right font-medium">P</th>
            <th className="w-16 px-2 py-2.5 text-right font-medium">%</th>
            <th className="w-20 px-2 py-2.5 text-right font-medium">Kills</th>
            <th className="w-16 px-2 py-2.5 text-right font-medium">Dif.</th>
            <th className="w-20 px-2 py-2.5 text-right font-medium">Duración</th>
            <th className="w-28 px-3 py-2.5 text-right font-medium">Forma</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-800">
          {rows.map((row) => (
            <tr key={row.team_id} className="transition-colors hover:bg-ink-900">
              <td className="tabular px-3 py-2.5 text-right text-ink-500">{row.position}</td>
              <td className="px-3 py-2.5">
                <Link
                  href={`/teams/${row.team_id}`}
                  className={`transition-colors hover:text-brand-aqua ${
                    row.position === 1 ? 'font-semibold' : 'font-medium'
                  }`}
                >
                  {row.team_name}
                </Link>
              </td>
              <td className="tabular px-2 py-2.5 text-right text-ink-400">{row.games}</td>
              <td className="tabular px-2 py-2.5 text-right text-brand-aqua">{row.wins}</td>
              <td className="tabular px-2 py-2.5 text-right text-ink-400">{row.losses}</td>
              <td className="tabular px-2 py-2.5 text-right text-ink-300">
                {Math.round(row.win_pct * 100)}%
              </td>
              <td className="tabular px-2 py-2.5 text-right text-ink-500">
                {row.kills}–{row.kills_against}
              </td>
              <td
                className={`tabular px-2 py-2.5 text-right ${
                  row.kill_diff > 0
                    ? 'text-brand-aqua'
                    : row.kill_diff < 0
                      ? 'text-brand-red-soft'
                      : 'text-ink-400'
                }`}
              >
                {row.kill_diff > 0 ? '+' : ''}
                {row.kill_diff}
              </td>
              <td className="tabular px-2 py-2.5 text-right text-ink-500">
                {row.avg_minutes ? `${row.avg_minutes} min` : '—'}
              </td>
              <td className="px-3 py-2.5">
                <Form results={row.form} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Los últimos resultados, del más viejo al más nuevo (la vista los trae al revés). */
function Form({ results }: { results: boolean[] | null }) {
  if (!results?.length) return <span className="text-ink-600">—</span>

  return (
    <span className="flex justify-end gap-1">
      {[...results].reverse().map((win, index) => (
        <span
          key={index}
          title={win ? 'Victoria' : 'Derrota'}
          className={`flex size-5 items-center justify-center rounded text-[10px] font-bold ${
            win ? 'bg-brand-aqua-dim text-brand-aqua' : 'bg-brand-red-dim text-brand-red-soft'
          }`}
        >
          {win ? 'V' : 'D'}
        </span>
      ))}
    </span>
  )
}
