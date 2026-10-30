import { UniversityLogos } from '@/components/tournament/UniversityLogo'
import { buttonClass } from '@/components/ui/Button'
import { daysUntil, shortDate } from '@/lib/lide2/dates'
import { CALENDAR, VENUE, VENUE_DIRECTIONS, VENUE_EMBED } from '@/lib/lide2/tournament'

/** The final's block: the tournament's only in-person date, with the venue. */
export function GrandFinal({
  champion,
  score,
}: {
  champion: { name: string; tags: string[] | null | undefined } | undefined
  score: string | undefined
}) {
  const final = CALENDAR.find((milestone) => milestone.id === 'final')
  if (!final) return null

  const days = champion ? 0 : daysUntil(final.date)
  const { day, month } = shortDate(final.date)

  return (
    <section id="final">
      <div className="relative overflow-hidden border-2 border-accent bg-gradient-to-br from-accent-dim via-surface to-surface shadow-hard-accent">
        {/* Red glow matching the hero's artwork. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(60% 120% at 88% 20%, color-mix(in srgb, var(--accent) 18%, transparent) 0%, transparent 70%)',
          }}
        />

        <div className="relative grid gap-8 px-6 py-8 sm:px-10 sm:py-10 lg:grid-cols-[1fr_20rem] lg:gap-12">
          <div className="flex flex-col">
            <p className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-kicker text-accent">
              <span className="bg-accent-strong px-1.5 py-0.5 text-2xs font-bold tracking-normal text-on-accent">
                Presencial
              </span>
              La única fecha fuera de línea
            </p>

            <h2 className="mt-3 text-4xl uppercase leading-none tracking-display sm:text-5xl">
              Gran final
            </h2>

            {champion ? (
              <div className="mt-4">
                <p className="text-xs font-bold uppercase tracking-kicker text-accent">
                  Campeón{score && <span className="text-fg-soft"> · {score}</span>}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <p className="font-display text-3xl font-bold uppercase leading-none tracking-heading">
                    {champion.name}
                  </p>
                  <UniversityLogos tags={champion.tags} size="fixture" />
                </div>
              </div>
            ) : (
              <p className="mt-4 max-w-lg text-sm text-fg-soft">
                Los ganadores de las semifinales se cruzan al mejor de cinco. Todo el resto del
                torneo se juega en línea; esta se juega en una sala, con los equipos en el mismo
                lugar.
              </p>
            )}

            <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-3">
              <div>
                <dt className="text-2xs uppercase tracking-wide text-faint">Fecha</dt>
                <dd className="tabular font-display text-2xl font-bold leading-tight">
                  {day} <span className="text-base font-medium text-muted">{month}</span>
                </dd>
              </div>

              <div>
                <dt className="text-2xs uppercase tracking-wide text-faint">Formato</dt>
                <dd className="font-display text-2xl font-bold leading-tight">{final.format}</dd>
              </div>

              {days > 0 && (
                <div>
                  <dt className="text-2xs uppercase tracking-wide text-faint">Faltan</dt>
                  <dd className="tabular font-display text-2xl font-bold leading-tight">
                    {days} <span className="text-base font-medium text-muted">días</span>
                  </dd>
                </div>
              )}
            </dl>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <a
                href={VENUE_DIRECTIONS}
                target="_blank"
                rel="noreferrer"
                className={buttonClass()}
              >
                Cómo llegar
              </a>
              <p className="text-xs text-faint">
                <span className="font-medium text-fg-soft">{VENUE.fullName}</span>
                <br />
                {VENUE.place}
              </p>
            </div>
          </div>

          {/*
            Google Maps embed, lazy-loaded so the visitor's browser only contacts
            Google when the map is on screen. Framed with `border-line-strong`
            and `shadow-hard`, like the group tables.
          */}
          <div className="relative overflow-hidden border-2 border-line-strong bg-raised shadow-hard">
            <iframe
              src={VENUE_EMBED}
              title={`Mapa de la ubicación del ${VENUE.fullName}, en La Plata`}
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
              className="h-56 w-full border-0 lg:h-full lg:min-h-[16rem]"
            />
          </div>
        </div>
      </div>
    </section>
  )
}
