'use client'

import { useActionState, useState } from 'react'
import {
  assignMatchAction,
  deleteMatchAction,
  type AssignResult,
  type DeleteResult,
} from '@/app/(app)/admin/actions'
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
  /** Team deduced from the already-linked players, when they reached a majority. */
  blueGuess: string | null
  redGuess: string | null
}

/**
 * Hooking a match up with its matchup.
 *
 * Two decisions on one screen: which matchup it is, and who played blue. The
 * second looks redundant - the matchup already says which two teams these are -
 * but the .rofl knows nothing about teams: it knows there was a blue side and a
 * red side. Somebody has to say which was which, at least the first time.
 *
 * Hence both sides are shown with their players and their champions: it is the
 * only way to recognize them on matchday 1, when no roster is loaded yet. From
 * matchday 2 on, `blueGuess` arrives resolved from the database and the
 * orientation comes preselected.
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
        <DeleteMatch matchId={match.matchId} />
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
            className="border-2 border-line-strong bg-raised px-3 py-2 text-sm focus:border-accent"
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
 * Deleting the whole match.
 *
 * It is for whatever was uploaded by mistake: a replay from another tournament,
 * a run through the flow, the wrong .rofl. Until now the only way out was the
 * SQL editor, because an unassigned match still shows on /partidas and its ten
 * accounts end up registered with pages of their own at /jugadores/[id].
 *
 * It confirms in two clicks and not with a `confirm()`: it is irreversible -
 * the .rofl is deleted from the bucket too, and it cannot be regenerated - and
 * the button sits next to the assign one. It goes in the header and not inside
 * the form because a form cannot live inside another.
 */
function DeleteMatch({ matchId }: { matchId: string }) {
  const [state, formAction, pending] = useActionState<DeleteResult | null, FormData>(
    deleteMatchAction,
    null,
  )
  const [confirming, setConfirming] = useState(false)

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-muted underline decoration-dotted underline-offset-4 transition-colors hover:text-danger"
      >
        Borrar
      </button>
    )
  }

  // The error replaces the warning and leaves the buttons where they were: if
  // the bucket failed, what is needed is another try, not starting over.
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="matchId" value={matchId} />
      <span className="text-danger" role={state?.error ? 'alert' : undefined}>
        {state?.error ?? 'Se borra el replay y todo lo que trajo.'}
      </span>
      <button
        type="submit"
        disabled={pending}
        className="border-2 border-danger/60 px-2 py-0.5 text-danger transition-colors hover:border-danger disabled:opacity-60"
      >
        {pending ? 'Borrando…' : 'Sí, borrar'}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="text-muted transition-colors hover:text-fg"
      >
        No
      </button>
    </form>
  )
}

/**
 * Which team the blue side starts preselected with.
 *
 * If the database managed to deduce either of the two sides, it is used.
 * Deducing red works too: it says blue is the other one.
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
 * The classes go in whole and are not assembled with `text-${tone}`: Tailwind
 * reads the source code to know which CSS to generate, and a class name built
 * at runtime appears nowhere, so it is not generated.
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
