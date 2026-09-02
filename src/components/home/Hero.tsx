import Image from 'next/image'
import { SectionNav, type NavSection } from '@/components/tournament/SectionNav'
import { UniversityLogo } from '@/components/tournament/UniversityLogo'
import { DiscordIcon, TwitchIcon } from '@/components/icons/Brands'
import { daysUntil, shortDate } from '@/lib/lide2/dates'
import { SLOGAN_PARTS, TOURNAMENT, type Milestone } from '@/lib/lide2/tournament'

/*
 * The hero's layers, bottom to top: the photo, a fade dissolving it into the
 * page's background, a vignette dimming the edges and a fine grain. The grain
 * is not decoration: a gradient this large over a JPEG shows banding, and the
 * noise breaks it up.
 *
 * Everything is built with color-mix over --canvas so the layers follow the
 * token and no hex values have to be kept in sync by hand.
 */
const HERO_OVERLAY = [
  // Vignette: closes the corners and takes the odd air out of the sides.
  'radial-gradient(115% 85% at 52% 30%, transparent 38%, var(--canvas) 100%)',
  // Wash from the left, which is where the text rests.
  'linear-gradient(to right, var(--canvas) 0%, color-mix(in srgb, var(--canvas) 55%, transparent) 42%, transparent 70%)',
  // Fade to the background: it ends in the page's colour, with no hard edge.
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

  // The hero stays dark in both themes: the text sits over the photo and not
  // over the site's background, and in the light theme it would stop reading.
  return (
    <header data-theme="dark" className="relative -mt-8 text-fg">
      {/*
        It breaks out of the centred container to take the window's width. The
        <body> carries overflow-x-clip because 100vw includes the scrollbar and
        without that a few pixels spill over sideways.
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
        The hero takes the whole fold: the window minus the site's bar.
        Everything else - title, figures and the section bar - fits inside it, so
        the first screen is a single piece. It used to be a fixed height and left
        half a calendar card peeking out, which is the worst of both worlds:
        neither the calendar nor the whole hero gets seen.

        `svh` and not `vh` because on a phone `vh` measures the window with the
        browser's bar hidden: with it in view, the section bar would end up below
        the fold. The `max()` is the floor for very short windows, where the text
        would not fit.
      */}
      <div className="relative flex min-h-[max(30rem,calc(100svh-var(--site-header)))] flex-col pb-4 pt-6">
        {/*
          This is not LIDE 2's official site and it is worth reading before
          anything else: the information comes from the organizers' announcement
          and sheets, but the page is maintained by other people.
        */}
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
              The slogan goes in the same family as the title: it is the second
              thing read, ahead of the tournament's long name. The noun in red
              and the article light, which is where the phrase's weight is.
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
            The one line that changes on its own: while there are dates left it
            counts down to the next one, and once the last one has been played
            it carries the champion. In between - the final played and the
            result not loaded yet - it shows nothing, which is better than a
            countdown to a date that has already happened.
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
                  {shortDate(next.date).day} de{' '}
                  {new Date(next.date).toLocaleDateString('es-AR', {
                    month: 'long',
                    timeZone: 'UTC',
                  })}
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

          {/*
            With each brand's icon in front. The two buttons looked identical -
            same border, same background, text of the same length - and where
            each one led had to be read. A logo is recognized before the word,
            which is exactly what a logo is for.
          */}
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

          {/*
            The hero's foot. It carries the same thin rule as the figures above,
            so the two rows read as one block and not as a bar left hanging at
            the bottom.
          */}
          <div className="border-t border-white/10 pt-2">
            <SectionNav sections={sections} />
          </div>
        </div>
      </div>
    </header>
  )
}

/**
 * The strip of universities, right where the hero ends.
 *
 * The hero promises "13 universities" as a loose figure; this delivers on it
 * and is also the first thing somebody who arrives without knowing what LIDE is
 * gets to see: a tournament between universities from all over the country, not
 * a league of teams with made-up names.
 *
 * It scrolls on its own because at 32px all thirteen do not fit across a
 * phone's width and a cut-off row looks like a bug. The list goes in twice: the
 * animation ends exactly when the second copy sits where the first one started,
 * and there it loops back to zero with no jump. The copy is aria-hidden so a
 * screen reader reads all thirteen only once.
 *
 * It pauses on hover and - what actually matters - under
 * `prefers-reduced-motion`, where it stays still and is dragged by hand: there
 * are people who get motion sick from a loop, and a decorative strip is not
 * worth that.
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
      {/*
        The mask fades both edges out. Without it the strip ends in a flush cut
        mid-word ("…de la Empresa"), which reads as a rendering error and not as
        something that keeps moving.
      */}
      <div className="group flex overflow-x-auto border-y border-line py-3 [mask-image:linear-gradient(to_right,transparent,black_3rem,black_calc(100%-3rem),transparent)] motion-safe:overflow-hidden">
        <div className="flex motion-safe:animate-[tira_60s_linear_infinite] motion-safe:group-hover:[animation-play-state:paused]">
          {strip(false)}
          {strip(true)}
        </div>
      </div>
    </section>
  )
}
