/**
 * Genera la imagen estática del mapa de la sede: `public/citt-mapa.png`.
 *
 * La alternativa era embeber el mapa de Google, pero eso hace que el navegador
 * de cada visitante contacte a Google y acepte sus cookies aunque nunca toque el
 * mapa. Bajando los tiles una sola vez acá, la página termina sirviendo un PNG
 * propio y no habla con nadie; el que quiere indicaciones hace clic y recién ahí
 * sale del sitio.
 *
 * Los tiles son de OpenStreetMap, que es libre pero pide dos cosas: identificarse
 * con un User-Agent de verdad y mostrar la atribución junto al mapa. Lo primero
 * está acá abajo; lo segundo, en la esquina de la imagen en la página.
 *
 *   npx tsx scripts/fetch-venue-map.ts
 *
 * Sólo hay que volver a correrlo si cambia la sede.
 */

import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { VENUE } from '../src/lib/lide2/tournament'

const ZOOM = 16
const WIDTH = 768
const HEIGHT = 576
const TILE = 256
const OUTPUT = path.join(process.cwd(), 'public', 'citt-mapa.png')

const USER_AGENT = 'lide-torneo/1.0 (generador de mapa estatico de la sede; una sola corrida)'

/** Coordenadas geográficas al sistema de píxeles global de los tiles web. */
function project(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const scale = TILE * 2 ** zoom
  const latRad = (lat * Math.PI) / 180
  return {
    x: ((lng + 180) / 360) * scale,
    y: ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * scale,
  }
}

async function fetchTile(zoom: number, x: number, y: number): Promise<Buffer> {
  const url = `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })

  if (!response.ok) {
    throw new Error(`${url}: ${response.status} ${response.statusText}`)
  }

  return Buffer.from(await response.arrayBuffer())
}

/**
 * Chinche de la sede. Va con borde blanco porque el mapa abajo puede ser claro
 * (calles) u oscuro (parques) y el rojo solo se pierde contra algunos verdes.
 */
function marker(): Buffer {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="56" viewBox="0 0 44 56">
       <path d="M22 55C22 55 40 33.5 40 21A18 18 0 1 0 4 21C4 33.5 22 55 22 55Z"
             fill="#e11d2f" stroke="#ffffff" stroke-width="3.5" stroke-linejoin="round"/>
       <circle cx="22" cy="21" r="6.5" fill="#ffffff"/>
     </svg>`,
  )
}

async function main() {
  const center = project(VENUE.lat, VENUE.lng, ZOOM)
  const left = Math.round(center.x - WIDTH / 2)
  const top = Math.round(center.y - HEIGHT / 2)

  const firstX = Math.floor(left / TILE)
  const lastX = Math.floor((left + WIDTH - 1) / TILE)
  const firstY = Math.floor(top / TILE)
  const lastY = Math.floor((top + HEIGHT - 1) / TILE)

  const wanted: { x: number; y: number }[] = []
  for (let y = firstY; y <= lastY; y++) {
    for (let x = firstX; x <= lastX; x++) wanted.push({ x, y })
  }

  console.log(`Bajando ${wanted.length} tiles de OpenStreetMap (zoom ${ZOOM})…`)

  // De a uno y no en paralelo: son pocos y la política de uso de OSM pide no
  // castigar el servidor con ráfagas.
  const layers: { input: Buffer; left: number; top: number }[] = []
  for (const tile of wanted) {
    layers.push({
      input: await fetchTile(ZOOM, tile.x, tile.y),
      left: tile.x * TILE - left,
      top: tile.y * TILE - top,
    })
  }

  // La chinche apunta con la punta de abajo, así que se corre media imagen a la
  // izquierda y toda su altura hacia arriba.
  layers.push({
    input: marker(),
    left: Math.round(WIDTH / 2 - 22),
    top: Math.round(HEIGHT / 2 - 56),
  })

  const image = await sharp({
    create: { width: WIDTH, height: HEIGHT, channels: 3, background: '#e8e0d8' },
  })
    .composite(layers)
    .png({ compressionLevel: 9, palette: true })
    .toBuffer()

  await writeFile(OUTPUT, image)
  console.log(
    `Listo: public/citt-mapa.png (${WIDTH}×${HEIGHT}, ${Math.round(image.length / 1024)} KB)`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
