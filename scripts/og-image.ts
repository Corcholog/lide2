/**
 * Generates the link preview image (src/app/opengraph-image.jpg).
 *
 *   npm run og
 *
 * Generated once and committed rather than rendered per request with
 * `ImageResponse`: it depends on no data, and the result can be reviewed before
 * it is published. Text uses Arial Black because the SVG is rendered locally,
 * where the site's Archivo Black webfont is not available.
 */
import { writeFileSync } from 'node:fs'
import sharp from 'sharp'
import { TOURNAMENT, SLOGAN_PARTS, tournamentStartDate } from '../src/lib/lide2/tournament'

/** The size link previews use: 1200 x 630. */
const WIDTH = 1200
const HEIGHT = 630

const HERO = 'public/lide2-hero.jpg'
const OUTPUT = 'src/app/opengraph-image.jpg'

const RED = '#ff4353'
/** The dark theme's --fg, used for the title. */
const LIGHT = '#e9e9ee'
const BACKGROUND = '#0a0a0b'

/** Escapes `&`, `<` and `>` for the SVG. */
function xml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/*
 * The slogan in two colors, like the hero: light article, red noun.
 *
 * Built as tspans on a single line with xml:space="preserve", since the SVG
 * would otherwise collapse or merge the spaces. It already contains markup, so
 * it must not be passed through xml() again.
 */
const slogan = SLOGAN_PARTS.map(
  ({ article, noun }) =>
    `<tspan fill="${LIGHT}">${xml(article.toUpperCase())} </tspan>` +
    `<tspan fill="${RED}">${xml(noun.toUpperCase())}.</tspan>`,
).join(' ')

/*
 * Layers, bottom to top: the cropped artwork, a gradient darkening the left side
 * behind the text, and the text. The crop uses the hero's focus point (52% 20%).
 */
const textLayer = Buffer.from(`
<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="wash" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="${BACKGROUND}" stop-opacity="0.97"/>
      <stop offset="45%"  stop-color="${BACKGROUND}" stop-opacity="0.82"/>
      <stop offset="100%" stop-color="${BACKGROUND}" stop-opacity="0.15"/>
    </linearGradient>
    <linearGradient id="foot" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="${BACKGROUND}" stop-opacity="0"/>
      <stop offset="100%" stop-color="${BACKGROUND}" stop-opacity="0.85"/>
    </linearGradient>
  </defs>

  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#wash)"/>
  <rect y="${HEIGHT - 200}" width="${WIDTH}" height="200" fill="url(#foot)"/>

  <g font-family="Arial Black, Arial Bold, Impact, sans-serif">
    <text x="72" y="150" font-size="22" letter-spacing="6" fill="${RED}">
      ${xml(TOURNAMENT.organizer.toUpperCase())}
    </text>

    <text x="66" y="310" font-size="168" letter-spacing="-6" fill="${LIGHT}">
      ${xml(TOURNAMENT.name.toUpperCase())}
    </text>

    <text x="72" y="372" font-size="40" letter-spacing="-1" xml:space="preserve">${slogan}</text>
  </g>

  <g font-family="Arial, Helvetica, sans-serif">
    <text x="72" y="428" font-size="25" fill="#b4b4bf">${xml(TOURNAMENT.fullName)}</text>

    <text x="72" y="546" font-size="27" font-weight="bold" fill="${LIGHT}">
      ${TOURNAMENT.teams} equipos · ${TOURNAMENT.universities} universidades · ${TOURNAMENT.players} jugadores
    </text>
    <text x="72" y="580" font-size="22" fill="#8f8f9c">Arranca el ${tournamentStartDate({ year: true })}</text>
  </g>

  <!--
    Saying it is not the official site. It is the most shared piece and the one
    that travels furthest from its context: without this, a loose link in a
    Discord passes for a message from the organizers.
  -->
  <g font-family="Arial, Helvetica, sans-serif">
    <rect x="${WIDTH - 286}" y="52" width="214" height="42" fill="${BACKGROUND}" fill-opacity="0.55"
          stroke="#ffffff" stroke-opacity="0.32" stroke-width="2"/>
    <text x="${WIDTH - 179}" y="79" font-size="16" letter-spacing="3"
          text-anchor="middle" fill="#d5d2d8">PÁGINA NO OFICIAL</text>
  </g>
</svg>
`)

async function main() {
  const photo = await sharp(HERO)
    .resize(WIDTH, HEIGHT, { fit: 'cover', position: sharp.strategy.attention })
    .toBuffer()

  const png = await sharp(photo)
    .composite([{ input: textLayer, top: 0, left: 0 }])
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer()

  writeFileSync(OUTPUT, png)
  console.log(`${OUTPUT} · ${WIDTH}x${HEIGHT} · ${Math.round(png.length / 1024)} KB`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
