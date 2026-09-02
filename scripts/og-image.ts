/**
 * Generates the image that shows when somebody pastes the site's link.
 *
 *   npm run og
 *
 * It is generated once and committed as src/app/opengraph-image.jpg, which is
 * the name Next looks for on its own. Static and not `ImageResponse` on
 * purpose: the image depends on no data, so generating it on every request
 * would be paying at runtime for something that never changes. It also means
 * the result can be looked at before it goes up.
 *
 * The text is set in Arial Black because the SVG is drawn by the machine that
 * runs this, not by the browser, and the site's Archivo Black only exists as a
 * webfont. They are the two heavy grotesques of the same family and at this
 * size the difference does not show; if it ever bothers anyone, the way out is
 * putting the .ttf in the repo.
 */
import { writeFileSync } from 'node:fs'
import sharp from 'sharp'
import { TOURNAMENT, SLOGAN_PARTS } from '../src/lib/lide2/tournament'

/** What Facebook, WhatsApp, Discord and Twitter ask for: 1200 x 630. */
const WIDTH = 1200
const HEIGHT = 630

const HERO = 'public/lide2-hero.jpg'
const OUTPUT = 'src/app/opengraph-image.jpg'

const RED = '#ff4353'
/** The same --fg as the dark theme, which is what the title uses. */
const LIGHT = '#e9e9ee'
const BACKGROUND = '#0a0a0b'

/** `&` and `<` break the SVG, and the names come from a data file. */
function xml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/*
 * The slogan in two colours, same as the hero: the article light and the noun
 * red, which is where the phrase's weight is (see the Hero in
 * src/components/home/Hero.tsx). It used to come out entirely red, so the
 * thumbnail seen when pasting the link did not match the first thing seen on
 * arrival.
 *
 * It is assembled as tspans and with xml:space="preserve" on one line: without
 * that the SVG collapses the newlines and the indentation, and the words come
 * out stuck together or with too much air. That is why this string already
 * carries markup and cannot be run through xml() again when interpolated.
 */
const slogan = SLOGAN_PARTS.map(
  ({ article, noun }) =>
    `<tspan fill="${LIGHT}">${xml(article.toUpperCase())} </tspan>` +
    `<tspan fill="${RED}">${xml(noun.toUpperCase())}.</tspan>`,
).join(' ')

/*
 * The layers, bottom to top: the cropped photo, a gradient dimming it from the
 * left - which is where the text rests - and the text.
 *
 * The crop points at the same place as the site's hero (52% 20%), so the
 * thumbnail and the page show the same part of the artwork.
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

    <text x="66" y="310" font-size="168" letter-spacing="-6" fill="#e9e9ee">
      ${xml(TOURNAMENT.name.toUpperCase())}
    </text>

    <text x="72" y="372" font-size="40" letter-spacing="-1" xml:space="preserve">${slogan}</text>
  </g>

  <g font-family="Arial, Helvetica, sans-serif">
    <text x="72" y="428" font-size="25" fill="#b4b4bf">${xml(TOURNAMENT.fullName)}</text>

    <text x="72" y="546" font-size="27" font-weight="bold" fill="#e9e9ee">
      ${TOURNAMENT.teams} equipos · ${TOURNAMENT.universities} universidades · ${TOURNAMENT.players} jugadores
    </text>
    <text x="72" y="580" font-size="22" fill="#8f8f9c">Arranca el 5 de septiembre de 2026</text>
  </g>

  <!--
    Saying it is not the official site. It is the most shared piece and the one
    that travels furthest from its context: without this, a loose link in a
    Discord passes for a message from the organizers.
  -->
  <g font-family="Arial, Helvetica, sans-serif">
    <rect x="${WIDTH - 286}" y="52" width="214" height="42" fill="#0a0a0b" fill-opacity="0.55"
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
