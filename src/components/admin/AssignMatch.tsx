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

/**
 * Somewhere a replay can be filed: a group-phase matchup or a playoff series.
 * `kind` picks which of the two the server calls, since they are different
 * tables and different functions.
 */
export interface MatchupOption {
  id: string
  kind: 'fixture' | 'serie'
  /** "Fecha 1 · Turno 2 · Grupo A", or "Cuartos de final · Cruce 2". */
  label: string
  teamA: { id: string; name: string }
  teamB: { id: string; name: string }
  /**
   * For a series, the games of the best-of that nobody has filed yet. A group
   * matchup is a single game and has none.
   */
  freeGames?: number[]
}

export interface UnassignedMatch {
  matchId: string
  playedAt: string | null
  gameLengthMs: number
  patch: string | null
  winningSide: 100 | 200 | null
  bluePlayers: SidePlayer[]
  redPlayers: SidePlayer[]
  /** The team deduced from already linked players, when a majority matched. */
  blueGuess: string | null
  redGuess: string | null
}

/**
 * Links a match to its matchup and says which team played blue.
 *
 * The .rofl only knows blue and red sides, not teams, so an admin picks the
 * orientation, at least the first time. Both sides are shown with players and
 * champions to recognize them; once rosters are known, `blueGuess` arrives from
 * the database and the orientation is preselected.
 */
export function AssignMatch({
  match,
  matchups,
}: {
  match: UnassignedMatch
  matchups: MatchupOption[]
}) {
  const [state, formAction, pending] = useActionState<AssignResult | null, FormData>(
    assignMatchAction,
    null,
  )

  const suggested = matchups.find(
    (option) =>
      (match.blueGuess !== null &&
        (option.teamA.id === match.blueGuess || option.teamB.id === match.blueGuess)) ||
      (match.redGuess !== null &&
        (option.teamA.id === match.redGuess || option.teamB.id === match.redGuess)),
  )

  const [matchupId, setMatchupId] = useState(suggested?.id ?? '')
  const matchup = matchups.find((entry) => entry.id === matchupId)
  const [gameNumber, setGameNumber] = useState('')
  const [blueTeamId, setBlueTeamId] = useState(orientationFor(suggested, match))

  function pickMatchup(id: string) {
    setMatchupId(id)
    // The game number belongs to the series that was picked, not the next one.
    setGameNumber('')
    setBlueTeamId(orientationFor(matchups.find((entry) => entry.id === id), match))
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
          <span className="text-xs uppercase tracking-wide text-faint">Cruce o serie</span>
          <select
            name="matchupId"
            value={matchupId}
            onChange={(event) => pickMatchup(event.target.value)}
            className="border-2 border-line-strong bg-raised px-3 py-2 text-sm focus:border-accent"
          >
            <option value="">Elegir…</option>
            {matchups.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label} — {entry.teamA.name} vs {entry.teamB.name}
              </option>
            ))}
          </select>
        </label>

        {/* Which table the chosen option lives in, so the action knows. */}
        <input type="hidden" name="kind" value={matchup?.kind ?? 'fixture'} />

        {/*
          Only a series has games to tell apart: a group matchup is one game.
          The numbers already filed are left out, so the same one cannot be
          claimed twice from here.
        */}
        {matchup?.kind === 'serie' && (
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-faint">¿Qué partida de la serie?</span>
            <select
              name="gameNumber"
              value={gameNumber}
              onChange={(event) => setGameNumber(event.target.value)}
              className="border-2 border-line-strong bg-raised px-3 py-2 text-sm focus:border-accent"
            >
              <option value="">Elegir…</option>
              {(matchup.freeGames ?? []).map((number) => (
                <option key={number} value={number}>
                  Partida {number}
                </option>
              ))}
            </select>
          </label>
        )}

        {matchup && (
          <fieldset className="flex flex-col gap-1">
            <legend className="text-xs uppercase tracking-wide text-faint">
              ¿Quién jugó de azul?
            </legend>
            <div className="flex flex-wrap gap-2">
              {[matchup.teamA, matchup.teamB].map((team) => (
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
            disabled={
              pending || !matchupId || !blueTeamId || (matchup?.kind === 'serie' && !gameNumber)
            }
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
 * Deletes the whole match, for uploads made by mistake.
 *
 * Two-click confirmation instead of `confirm()`: it is irreversible (the .rofl
 * is deleted from storage too) and sits next to the assign button. It lives in
 * the header because forms cannot be nested.
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

  // On error the buttons stay in place so the delete can simply be retried.
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
 * The team preselected for the blue side: whichever side the database could
 * deduce (a deduced red side implies the other team is blue).
 */
function orientationFor(matchup: MatchupOption | undefined, match: UnassignedMatch): string {
  if (!matchup) return ''

  const teams = [matchup.teamA.id, matchup.teamB.id]
  if (match.blueGuess && teams.includes(match.blueGuess)) return match.blueGuess
  if (match.redGuess && teams.includes(match.redGuess)) {
    return teams.find((id) => id !== match.redGuess) ?? ''
  }
  return ''
}

/** Full class names: Tailwind cannot see classes built at runtime (`text-${tone}`). */
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
