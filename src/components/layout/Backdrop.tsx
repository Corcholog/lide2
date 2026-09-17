/**
 * The site's fixed background, visible behind content once the hero scrolls
 * away.
 *
 * Soft red and steel blooms (the artwork's palette) and a few very large
 * shapes, rather than a repeating pattern that would compete with borders. A
 * fine grain breaks up gradient banding. Built with `color-mix` over the theme
 * tokens.
 */

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")"

export function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-canvas">
      {/* Blooms: red at the top right, steel at the bottom left. */}
      <div
        className="absolute inset-0"
        style={{
          background: [
            'radial-gradient(75% 60% at 92% -10%, color-mix(in srgb, var(--accent) 16%, transparent) 0%, transparent 60%)',
            'radial-gradient(70% 55% at -12% 108%, color-mix(in srgb, var(--color-steel) 30%, transparent) 0%, transparent 65%)',
            'linear-gradient(200deg, transparent 35%, color-mix(in srgb, var(--color-steel) 10%, transparent) 100%)',
          ].join(', '),
        }}
      />

      {/*
        Shapes drawn with clip-path, so they scale to any screen and follow the
        theme. Kept large; small shapes read as noise.
      */}
      <div
        className="absolute -right-[12vw] top-[6vh] hidden h-[62vh] w-[52vw] bg-accent/[0.06] lg:block"
        style={{ clipPath: 'polygon(42% 0, 100% 16%, 100% 84%, 0 100%)' }}
      />
      <div
        className="absolute -left-[10vw] bottom-[-10vh] hidden h-[58vh] w-[46vw] bg-steel/[0.12] lg:block"
        style={{ clipPath: 'polygon(0 12%, 100% 0, 58% 100%, 0 88%)' }}
      />
      <div
        className="absolute left-[52vw] top-[62vh] hidden h-[30vh] w-[22vw] border-2 border-accent/[0.12] xl:block"
        style={{ clipPath: 'polygon(50% 0, 100% 100%, 0 100%)' }}
      />

      <div
        className="absolute inset-0 opacity-[0.035] mix-blend-overlay"
        style={{ backgroundImage: GRAIN }}
      />
    </div>
  )
}
