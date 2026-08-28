/**
 * Genera la imagen que se ve cuando alguien pega el link del sitio.
 *
 *   npm run og
 *
 * Se genera una vez y se commitea como src/app/opengraph-image.jpg, que es el
 * nombre que Next busca solo. Estática y no `ImageResponse` a propósito: la
 * imagen no depende de ningún dato, así que generarla en cada request sería
 * pagar en runtime por algo que no cambia nunca. Además así se puede mirar el
 * resultado antes de subirlo.
 *
 * El texto va en Arial Black porque el SVG lo dibuja la máquina que corre esto,
 * no el navegador, y la Archivo Black del sitio sólo existe como webfont. Son
 * las dos grotescas pesadas del mismo palo y a este tamaño la diferencia no se
 * ve; si algún día molesta, la salida es meter el .ttf en el repo.
 */
import { writeFileSync } from 'node:fs'
import sharp from 'sharp'
import { TOURNAMENT, SLOGAN_PARTS } from '../src/lib/lide2/tournament'

/** Lo que piden Facebook, WhatsApp, Discord y Twitter: 1200 x 630. */
const WIDTH = 1200
const HEIGHT = 630

const HERO = 'public/lide2-hero.jpg'
const SALIDA = 'src/app/opengraph-image.jpg'

const ROJO = '#ff4353'
/** El mismo --fg del tema oscuro, que es el que usa el titulo. */
const CLARO = '#e9e9ee'
const FONDO = '#0a0a0b'

/** `&` y `<` rompen el SVG, y los nombres salen de un archivo de datos. */
function xml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/*
 * El slogan en dos colores, igual que la portada: el articulo en claro y el
 * sustantivo en rojo, que es donde esta el peso de la frase (ver el Hero en
 * src/app/(app)/page.tsx). Antes salia entero en rojo, asi que la miniatura que
 * se ve al pegar el link no coincidia con lo primero que se ve al entrar.
 *
 * Va armado como tspans y con xml:space="preserve" en una sola linea: sin eso
 * el SVG colapsa los saltos de linea y la indentacion, y las palabras salen
 * pegadas o con aire de mas. Por eso este string ya trae marcado y no se lo
 * puede volver a pasar por xml() al interpolarlo.
 */
const slogan = SLOGAN_PARTS.map(
  ({ article, noun }) =>
    `<tspan fill="${CLARO}">${xml(article.toUpperCase())} </tspan>` +
    `<tspan fill="${ROJO}">${xml(noun.toUpperCase())}.</tspan>`,
).join(' ')

/*
 * Las capas, de abajo hacia arriba: la foto recortada, un degradado que la
 * apaga desde la izquierda —que es donde apoya el texto— y el texto.
 *
 * El recorte apunta al mismo lugar que la portada del sitio (52% 20%), así que
 * la miniatura y la página muestran la misma parte del arte.
 */
const capaTexto = Buffer.from(`
<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="lavado" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="${FONDO}" stop-opacity="0.97"/>
      <stop offset="45%"  stop-color="${FONDO}" stop-opacity="0.82"/>
      <stop offset="100%" stop-color="${FONDO}" stop-opacity="0.15"/>
    </linearGradient>
    <linearGradient id="pie" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="${FONDO}" stop-opacity="0"/>
      <stop offset="100%" stop-color="${FONDO}" stop-opacity="0.85"/>
    </linearGradient>
  </defs>

  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#lavado)"/>
  <rect y="${HEIGHT - 200}" width="${WIDTH}" height="200" fill="url(#pie)"/>

  <g font-family="Arial Black, Arial Bold, Impact, sans-serif">
    <text x="72" y="150" font-size="22" letter-spacing="6" fill="${ROJO}">
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
    Que diga que no es el sitio oficial. Es la pieza que más se comparte y la
    que más lejos llega del contexto: sin esto, un link suelto en un Discord
    pasa por comunicación de la organización.
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
  const foto = await sharp(HERO)
    .resize(WIDTH, HEIGHT, { fit: 'cover', position: sharp.strategy.attention })
    .toBuffer()

  const png = await sharp(foto)
    .composite([{ input: capaTexto, top: 0, left: 0 }])
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer()

  writeFileSync(SALIDA, png)
  console.log(`${SALIDA} · ${WIDTH}x${HEIGHT} · ${Math.round(png.length / 1024)} KB`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
