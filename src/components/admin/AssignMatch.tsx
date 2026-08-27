'use client'

import { useActionState, useState } from 'react'
import { assignMatchAction, type AssignResult } from '@/app/(app)/admin/actions'
import { formatDuration, formatKda, formatPosition } from '@/lib/format'

export interface SidePlayer {
  name: string | null
  champion: string
  position: string | null
  kills: number
  deaths: number
  assists: number
}

export interface FixtureOption {
  id: string
  /** "Fecha 1 · Turno 2 · Grupo A" */
  label: string
  teamA: { id: string; name: string }
  teamB: { id: string; name: string }
}

export interface UnassignedMatch {
  matchId: string
  playedAt: string | null
  gameLengthMs: number
  patch: string | null
  winningSide: 100 | 200 | null
  bluePlayers: SidePlayer[]
  redPlayers: SidePlayer[]
  /** Equipo deducido por los jugadores ya vinculados, si alcanzó la mayoría. */
  blueGuess: string | null
  redGuess: string | null
}

/**
 * Enganchar una partida con su cruce.
 *
 * Dos decisiones en una pantalla: qué cruce es, y quién jugó de azul. La
 * segunda parece redundante —el cruce ya dice qué dos equipos son— pero el
 * .rofl no sabe de equipos: sabe que hubo un lado azul y uno rojo. Alguien
 * tiene que decir cuál era cuál, al menos la primera vez.
 *
 * De ahí que los dos lados se muestren con sus jugadores y sus campeones: es la
 * única forma de reconocerlos en la fecha 1, cuando todavía no hay ningún
 * plantel cargado. A partir de la 2, `blueGuess` viene resuelto de la base y la
 * orientación queda preseleccionada.
 */
export function AssignMatch({
  match,
  fixtures,
}: {
  match: UnassignedMatch
  fixtures: FixtureOption[]
}) {
  const [state, formAction, pending] = useActionState<AssignResult | null, FormData>(
    assignMatchAction,
    null,
  )

  const suggested = fixtures.find(
    (fixture) =>
      (match.blueGuess !== null &&
        (fixture.teamA.id === match.blueGuess || fixture.teamB.id === match.blueGuess)) ||
      (match.redGuess !== null &&
        (fixture.teamA.id === match.redGuess || fixture.teamB.id === match.redGuess)),
  )

  const [fixtureId, setFixtureId] = useState(suggested?.id ?? '')
  const fixture = fixtures.find((entry) => entry.id === fixtureId)
  const [blueTeamId, setBlueTeamId] = useState(orientationFor(suggested, match))

  function pickFixture(id: string) {
    setFixtureId(id)
    setBlueTeamId(orientationFor(fixtures.find((entry) => entry.id === id), match))
  }

  return (
    <li className="flex flex-col gap-4 border-2 border-line bg-surface p-4 text-fg">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs text-muted">
        <span>
          {match.playedAt ? new Date(match.playedAt).toLocaleString('es-AR') : 'sin fecha'} ·{' '}
          {formatDuration(match.gameLengthMs)}
          {match.patch && ` · parche ${match.patch}`}
        </span>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <Side
          title="Azul"
          players={match.bluePlayers}
          won={match.winningSide === 100}
          tone="side-blue"
        />
        <Side
          title="Rojo"
          players={match.redPlayers}
          won={match.winningSide === 200}
          tone="side-red"
        />
      </div>

      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="matchId" value={match.matchId} />
        <input type="hidden" name="blueTeamId" value={blueTeamId} />

        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-faint">Cruce del fixture</span>
          <select
            name="fixtureId"
            value={fixtureId}
            onChange={(event) => pickFixture(event.target.value)}
            className="border-2 border-line-strong bg-raised px-3 py-2 text-sm outline-none focus:border-accent"
          >
            <option value="">Elegir…</option>
            {fixtures.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label} — {entry.teamA.name} vs {entry.teamB.name}
              </option>
            ))}
          </select>
        </label>

        {fixture && (
          <fieldset className="flex flex-col gap-1">
            <legend className="text-xs uppercase tracking-wide text-faint">
              ¿Quién jugó de azul?
            </legend>
            <div className="flex flex-wrap gap-2">
              {[fixture.teamA, fixture.teamB].map((team) => (
                <button
                  key={team.id}
                  type="button"
                  onClick={() => setBlueTeamId(team.id)}
                  aria-pressed={blueTeamId === team.id}
                  className={`border-2 px-3 py-1.5 text-sm transition-colors ${
                    blueTeamId === team.id
                      ? 'border-accent bg-accent-dim text-accent'
                      : 'border-line text-muted hover:border-line-strong hover:text-accent'
                  }`}
                >
                  {team.name}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending || !fixtureId || !blueTeamId}
            className="bg-accent-strong px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:bg-line-strong disabled:text-muted"
          >
            {pending ? 'Asignando…' : 'Asignar'}
          </button>

          {state?.error && (
            <p role="alert" className="text-sm text-danger">
              {state.error}
            </p>
          )}
          {state?.ok && (
            <p className="text-sm text-ok">
              Asignada
              {state.learned ? ` · ${state.learned} jugadores nuevos al plantel` : ''}
            </p>
          )}
        </div>

        {state?.conflicts && state.conflicts.length > 0 && (
          <p className="border-2 border-danger/40 bg-danger-dim px-3 py-2 text-xs text-danger">
            Estos ya jugaban en otro equipo y no se movieron solos:{' '}
            <strong>{state.conflicts.join(', ')}</strong>. Si el cambio es real, corregilo desde
            Equipos.
          </p>
        )}
      </form>
    </li>
  )
}

/**
 * Con qué equipo arranca preseleccionado el lado azul.
 *
 * Si la base ya pudo deducir alguno de los dos lados, se usa. Deducir el rojo
 * también sirve: dice que el azul es el otro.
 */
function orientationFor(fixture: FixtureOption | undefined, match: UnassignedMatch): string {
  if (!fixture) return ''

  const teams = [fixture.teamA.id, fixture.teamB.id]
  if (match.blueGuess && teams.includes(match.blueGuess)) return match.blueGuess
  if (match.redGuess && teams.includes(match.redGuess)) {
    return teams.find((id) => id !== match.redGuess) ?? ''
  }
  return ''
}

/**
 * Las clases van enteras y no armadas con `text-${tone}`: Tailwind lee el
 * código fuente para saber qué CSS generar, y un nombre de clase construido en
 * tiempo de ejecución no aparece en ningún lado, así que no se genera.
 */
const TONE = {
  'side-blue': 'text-side-blue',
  'side-red': 'text-side-red',
} as const

function Side({
  title,
  players,
  won,
  tone,
}: {
  title: string
  players: SidePlayer[]
  won: boolean
  tone: keyof typeof TONE
}) {
  return (
    <div className={`border-2 ${won ? 'border-accent' : 'border-line'} bg-raised`}>
      <p
        className={`border-b-2 ${won ? 'border-accent' : 'border-line'} px-3 py-1.5 text-xs font-bold uppercase tracking-wide ${TONE[tone]}`}
      >
        {title}
        {won && <span className="ml-2 text-accent">ganó</span>}
      </p>
      <ul className="divide-y divide-line">
        {players.map((player, index) => (
          <li key={index} className="flex items-baseline gap-2 px-3 py-1.5 text-xs">
            <span className="w-14 shrink-0 text-faint">{formatPosition(player.position)}</span>
            <span className="min-w-0 flex-1 truncate font-medium">{player.name ?? '—'}</span>
            <span className="shrink-0 text-muted">{player.champion}</span>
            <span className="shrink-0 tabular-nums text-faint">
              {formatKda(player.kills, player.deaths, player.assists)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
