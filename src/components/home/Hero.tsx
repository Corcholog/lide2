import Image from 'next/image'
import { SectionNav, type NavSection } from '@/components/tournament/SectionNav'
import { UniversityLogo } from '@/components/tournament/UniversityLogo'
import { DiscordIcon, TwitchIcon } from '@/components/icons/Brands'
import { dayAndMonth, daysUntil } from '@/lib/lide2/dates'
import { SLOGAN_PARTS, TOURNAMENT, type Milestone } from '@/lib/lide2/tournament'

/*
 * The hero's layers, bottom to top: photo, vignette, left wash and fade into
 * the page background, plus a fine grain that hides banding in the large
 * gradients. Built with color-mix over --canvas so they follow the token.
 */
const HERO_OVERLAY = [
  // Vignette.
  'radial-gradient(115% 85% at 52% 30%, transparent 38%, var(--canvas) 100%)',
  // Wash from the left, behind the text.
  'linear-gradient(to right, var(--canvas) 0%, color-mix(in srgb, var(--canvas) 55%, transparent) 42%, transparent 70%)',
  // Fade into the page background.
  [
    'linear-gradient(to top',
    'var(--canvas) 0%',
    'color-mix(in srgb, var(--canvas) 94%, transparent) 16%',
    'color-mix(in srgb, var(--canvas) 60%, transparent) 46%',
    'color-mix(in srgb, var(--canvas) 26%, transparent) 76%',
    'color-mix(in srgb, var(--canvas) 8%, transparent) 100%)',
  ].join(', '),
].join(', ')

const HERO_GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")"

export function Hero({
  next,
  champion,
  sections,
}: {
  next: Milestone | undefined
  champion: string | undefined
  sections: NavSection[]
}) {
  const days = next ? daysUntil(next.date) : null

  const stats = [
    { value: TOURNAMENT.players, label: 'jugadores' },
    { value: TOURNAMENT.teams, label: 'equipos' },
    { value: TOURNAMENT.universities, label: 'universidades' },
    { value: TOURNAMENT.groups, label: 'grupos' },
    { value: 1, label: 'campeón' },
  ]

  // The hero is always dark: its text sits on the photo.
  return (
    <header data-theme="dark" className="relative -mt-8 text-fg">
      {/*
        Full window width, breaking out of the centered container. <html> has
        overflow-x-clip because 100vw includes the scrollbar.
      */}
      <div className="isolate absolute inset-y-0 left-1/2 w-screen -translate-x-1/2 overflow-hidden bg-canvas">
        <Image
          src="/lide2-hero.jpg"
          alt="Campeones de League of Legends con las skins de campeón del mundo de T1"
          fill
          priority
          sizes="100vw"
          className="object-cover object-[52%_20%]"
        />
        <div className="absolute inset-0" style={{ background: HERO_OVERLAY }} />
        <div
          className="absolute inset-0 opacity-[0.045] mix-blend-overlay"
          style={{ backgroundImage: HERO_GRAIN }}
          aria-hidden
        />
      </div>

      {/*
        Fills the first screen minus the site header. `svh` rather than `vh`, so
        the section bar stays above the fold on phones with the browser bar
        visible; `max()` sets a floor for very short windows.
      */}
      <div className="relative flex min-h-[max(30rem,calc(100svh-var(--site-header)))] flex-col pb-4 pt-6">
        {/* Unofficial-site notice. */}
        <p className="self-start border border-white/20 bg-black/40 px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.2em] text-fg-soft backdrop-blur">
          Página no oficial
        </p>

        <div className="mt-auto flex flex-col gap-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.25em] text-accent">
              {TOURNAMENT.organizer}
            </p>
            <h1 className="mt-2 text-6xl uppercase leading-[0.82] tracking-[-0.045em] sm:text-7xl">
              {TOURNAMENT.name}
            </h1>
            {/*
              Slogan in the display font, with the noun in red.
            */}
            <p className="font-display mt-3 text-lg uppercase leading-none tracking-[-0.02em] sm:text-2xl">
              {SLOGAN_PARTS.map(({ article, noun }, index) => (
                <span key={noun} className="whitespace-nowrap">
                  {index > 0 && ' '}
                  <span className="text-fg">{article} </span>
                  <span className="text-accent">{noun}.</span>
                </span>
              ))}
            </p>
            <p className="mt-3 max-w-md text-sm text-fg-soft">{TOURNAMENT.fullName}</p>
          </div>

          {/*
            Countdown to the next date; after the last one, the champion. Nothing
            in between (final played, result not loaded yet).
          */}
          {next && days !== null ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <p className="flex items-baseline gap-2 rounded-md bg-accent-strong px-3 py-1.5 text-white">
                <span className="tabular font-display text-2xl font-bold leading-none">
                  {days === 0 ? '¡HOY!' : days}
                </span>
                {days !== 0 && (
                  <span className="text-xs font-bold uppercase tracking-wide">
                    {days === 1 ? 'día' : 'días'}
                  </span>
                )}
              </p>
              <p className="text-sm">
                <span className="font-semibold">{next.label}</span>
                <span className="text-fg-soft">
                  {' · '}
                  {dayAndMonth(next.date)}
                  {next.detail ? ` · ${next.detail}` : ''}
                </span>
              </p>
            </div>
          ) : champion ? (
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
              <p className="rounded-md bg-accent-strong px-3 py-1.5 text-xs font-bold uppercase tracking-[0.2em] text-white">
                Campeón
              </p>
              <p className="font-display text-2xl font-bold uppercase leading-none tracking-[-0.02em]">
                {champion}
              </p>
            </div>
          ) : null}

          {/* Brand icons make the two links recognizable at a glance. */}
          <div className="flex flex-wrap gap-2">
            <a
              href={TOURNAMENT.broadcast.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded border border-white/20 bg-black/30 px-4 py-2 text-sm font-medium backdrop-blur transition-colors hover:border-accent hover:text-accent"
            >
              <TwitchIcon />
              Ver la transmisión
            </a>
            <a
              href={TOURNAMENT.discord}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded border border-white/20 bg-black/30 px-4 py-2 text-sm font-medium backdrop-blur transition-colors hover:border-accent hover:text-accent"
            >
              <DiscordIcon />
              Discord
            </a>
          </div>

          <dl className="mt-2 grid grid-cols-3 gap-x-6 gap-y-4 border-t border-white/10 pt-4 sm:grid-cols-5">
            {stats.map((stat) => (
              <div key={stat.label}>
                <dt className="sr-only">{stat.label}</dt>
                <dd>
                  <span className="tabular font-display block text-2xl font-bold leading-none">
                    {stat.value}
                  </span>
                  <span className="mt-1 block text-[11px] uppercase tracking-wide text-faint">
                    {stat.label}
                  </span>
                </dd>
              </div>
            ))}
          </dl>

          {/* Same thin rule as the figures above, so both rows read as one block. */}
          <div className="border-t border-white/10 pt-2">
            <SectionNav sections={sections} />
          </div>
        </div>
      </div>
    </header>
  )
}

/**
 * The scrolling strip of participating universities below the hero.
 *
 * The list is rendered twice (the copy is aria-hidden) so the animation loops
 * without a jump. It pauses on hover and does not move with
 * `prefers-reduced-motion`, where it can be scrolled by hand.
 */
export function UniversityStrip({
  universities,
}: {
  universities: { tag: string; name: string }[]
}) {
  if (universities.length === 0) return null

  const strip = (hidden: boolean) => (
    <ul className="flex shrink-0 items-center gap-8 pr-8" aria-hidden={hidden || undefined}>
      {universities.map((university) => (
        <li key={university.tag} className="flex shrink-0 items-center gap-2">
          <UniversityLogo tag={university.tag} size="lg" />
          <span className="whitespace-nowrap text-xs text-faint">{university.name}</span>
        </li>
      ))}
    </ul>
  )

  return (
    <section aria-label="Universidades participantes" className="-mt-4">
      {/* Edge fade, so the strip does not end in a hard cut mid-word. */}
      <div className="group flex overflow-x-auto border-y border-line py-3 [mask-image:linear-gradient(to_right,transparent,black_3rem,black_calc(100%-3rem),transparent)] motion-safe:overflow-hidden">
        <div className="flex motion-safe:animate-[tira_60s_linear_infinite] motion-safe:group-hover:[animation-play-state:paused]">
          {strip(false)}
          {strip(true)}
        </div>
      </div>
    </section>
  )
}
