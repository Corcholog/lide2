import { DiscordIcon, TwitchIcon } from '@/components/icons/Brands'
import { TOURNAMENT } from '@/lib/lide2/tournament'

/** Where the tournament is followed: the broadcast, the Discord and Battlefy. */
export function WhereToWatch() {
  return (
    <section className="flex flex-col gap-3 border-t border-line pt-6">
      <h2 className="text-sm font-medium text-muted">Dónde se sigue</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        {/* The icon beside the title and not above it: the card has three lines
            and one more row would make it grow without saying anything new. */}
        <a
          href={TOURNAMENT.broadcast.url}
          target="_blank"
          rel="noreferrer"
          className="group border-2 border-line bg-surface px-4 py-3 transition-colors hover:border-accent"
        >
          <p className="flex items-center gap-2 text-sm font-medium">
            <TwitchIcon className="size-4 text-muted transition-colors group-hover:text-accent" />
            Transmisión
          </p>
          <p className="text-xs text-faint">{TOURNAMENT.broadcast.channel}</p>
          <p className="text-xs text-dim">{TOURNAMENT.broadcast.schedule}</p>
        </a>

        <a
          href={TOURNAMENT.discord}
          target="_blank"
          rel="noreferrer"
          className="group border-2 border-line bg-surface px-4 py-3 transition-colors hover:border-accent"
        >
          <p className="flex items-center gap-2 text-sm font-medium">
            <DiscordIcon className="size-4 text-muted transition-colors group-hover:text-accent" />
            Discord
          </p>
          <p className="text-xs text-faint">Esports UNLP</p>
          <p className="text-xs text-dim">canal #busco-rival-lide2</p>
        </a>

        <div className="rounded-lg border border-dashed border-line px-4 py-3">
          <p className="text-sm font-medium text-muted">Battlefy</p>
          <p className="text-xs text-dim">matchups y resultados oficiales</p>
          <p className="text-xs text-dim">el link todavía no salió</p>
        </div>
      </div>
    </section>
  )
}
