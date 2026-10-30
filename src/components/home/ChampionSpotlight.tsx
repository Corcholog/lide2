import Link from 'next/link'
import { UniversityLogo } from '@/components/tournament/UniversityLogo'
import { formatPosition } from '@/lib/format'
import type { RosterCard } from '@/lib/lide2/champion-roster'
import { playerPath, teamPath } from '@/lib/routes'

/**
 * The tournament winner, right under the hero: the team and its universities
 * (crest and full name) on the left, a mini card per player beside it in lane
 * order.
 *
 * No hooks, so the admin preview can render it from a client component.
 */
export interface SpotlightUniversity {
  tag: string
  name: string
}

export interface SpotlightChampion {
  teamId: string
  name: string
  universities: SpotlightUniversity[]
}

/** A team's universities with their full names, the tag standing in for a missing one. */
export function withNames(
  tags: string[] | null | undefined,
  all: SpotlightUniversity[],
): SpotlightUniversity[] {
  return (tags ?? []).map((tag) => ({ tag, name: all.find((item) => item.tag === tag)?.name ?? tag }))
}

export function ChampionSpotlight({
  champion,
  score,
  players,
}: {
  champion: SpotlightChampion
  /** The final's games, winner first ("3-1"). */
  score?: string
  players: RosterCard[]
}) {
  return (
    <section
      id="campeon"
      aria-label="Campeón del torneo"
      className="relative overflow-hidden border-2 border-accent bg-gradient-to-br from-accent-dim via-surface to-surface shadow-hard-accent"
    >
      <div className="grid gap-5 px-6 py-6 sm:px-8 lg:grid-cols-[minmax(0,20rem)_1fr] lg:items-center lg:gap-8">
        <div className="flex flex-col gap-3">
          <p className="text-xs font-bold uppercase tracking-kicker text-accent">
            Campeón
            {score && <span className="text-fg-soft"> · {score}</span>}
          </p>

          <h2 className="text-3xl uppercase leading-none tracking-display sm:text-4xl">
            <Link href={teamPath(champion.teamId, 'playoffs')} className="transition-colors hover:text-accent">
              {champion.name}
            </Link>
          </h2>

          <ul className="flex flex-col gap-2">
            {champion.universities.map((university) => (
              <li key={university.tag} className="flex items-center gap-2.5">
                <UniversityLogo tag={university.tag} size="md" />
                <span className="text-sm text-fg-soft">{university.name}</span>
              </li>
            ))}
          </ul>
        </div>

        {players.length > 0 && (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {players.map((player) => (
              <li key={player.playerId} className="border-2 border-line bg-surface px-3 py-2.5">
                <p className="text-2xs font-bold uppercase tracking-wide text-accent">
                  {formatPosition(player.role)}
                </p>
                <Link
                  href={playerPath(player.playerId)}
                  className="mt-0.5 block truncate text-sm font-semibold transition-colors hover:text-accent"
                >
                  {player.name}
                </Link>
                <dl className="tabular mt-2 flex flex-col gap-0.5 text-xs">
                  <Stat
                    label="KDA"
                    value={player.stats?.kda ?? '—'}
                    title={player.stats ? `${player.stats.line} por partida` : undefined}
                  />
                  <Stat label="DPM" value={player.stats?.dpm ?? '—'} />
                  <Stat label="GPM" value={player.stats?.gpm ?? '—'} />
                </dl>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function Stat({ label, value, title }: { label: string; value: string | number; title?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2" title={title}>
      <dt className="text-2xs uppercase tracking-wide text-faint">{label}</dt>
      <dd className="font-semibold text-fg">{value}</dd>
    </div>
  )
}
